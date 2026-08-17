// Deterministic keyword-based fit scoring, now blended with one ML signal: a cosine-similarity
// term against a locally-computed embedding (see api/src/embeddings.ts). CLAUDE.md's prior
// decision deferred semantic matching pending a LOCAL model rather than a paid API — this is
// that model. Embeddings are precomputed and stored (ingest time for postings, profile-save time
// for the profile), so this function stays fully synchronous: it only ever reads two already-
// computed vectors and does cosine similarity, never calls out to Ollama itself.
//
// raw = clamp(0, 100,
//     roleSignal        // 0 | 6 | 16 | 30 | 42   graduated, title-only regex tiers
//   + 12 * mt/(mt+2)    // skills matched in the TITLE, saturating
//   + 22 * md/(md+6)    // skills matched in the DESCRIPTION, frequency-damped, saturating
//   + locationSignal    // 0 | 6
//   + 12 * max(0, cosineSimilarity(postingEmbedding, profileEmbedding))  // 0 if either is missing
//   - min(40, 20 * excludeHits)
//   - educationPenalty  // 0 | 15, if the posting's stated requirement outranks your profile's level
// )
//
// mt/md are weighted sums (w = 3 core / 1 secondary) over MATCHED skills only, and both terms are
// bounded saturating fractions — so adding an unmatched skill to the profile can never change the
// score (monotonicity, verified by a test). categorySignal/org bonuses are deliberately absent:
// per the v7 plan, Discovery's tabs already separate baseball from non-baseball, so baking
// category into the raw score would double-count what the tab filter already does. Per-tab
// PERCENTILE normalization of this raw score happens in routes/postings.ts, not here — this
// module only ever produces the raw formula output.

import { cosineSimilarity } from "./embeddings.js";

export interface FitScorePosting {
  title: string;
  organization: string;
  category?: string | null;
  location?: string | null;
  description?: string | null;
  educationRequirement?: string | null;
  embedding?: string | null;
}

export interface FitScoreProfile {
  skills: string;
  coreSkills?: string | null;
  preferredCategories?: string | null;
  locationKeywords?: string | null;
  excludeKeywords?: string | null;
  highestEducationLevel?: string | null;
  embedding?: string | null;
}

// Mirrors scrapers/src/education.ts's EDUCATION_RANK — duplicated rather than cross-imported
// since api/ and scrapers/ are independent packages (same convention as the dual-synced
// prisma/schema.prisma files).
const EDUCATION_RANK: Record<string, number> = { NONE: 0, BACHELORS: 1, MASTERS: 2, PHD: 3 };

export interface FitScoreReason {
  kind: "role" | "skill" | "location" | "exclude" | "semantic";
  label: string;
  points: number;
}

export interface FitScoreEvidence {
  term: string;
  excerpt: string;
}

export interface FitScoreResult {
  score: number;
  tier: FitTier;
  matchedSkills: string[];
  reasons: FitScoreReason[];
  evidence: FitScoreEvidence[];
}

export type FitTier = "Strong" | "Good" | "Fair" | "Weak";

export function fitTier(score: number): FitTier {
  if (score >= 65) return "Strong";
  if (score >= 40) return "Good";
  if (score >= 20) return "Fair";
  return "Weak";
}

// Graduated, title-only role signal — most specific tier first, first match wins (tiers are not
// summed). Replaces the old single 40-pt binary regex.
const ROLE_TIERS: { re: RegExp; points: number }[] = [
  {
    points: 42,
    re: /(data scien|quantitative resear|quantitative analy|quantitative develop|machine learning|research scientist|research engineer|biomechan|\br&d\b|research and development|baseball (systems|analytics|research|sciences)|player development|sport scien)/i,
  },
  {
    points: 30,
    re: /(\banalyst\b|analytics|\bresearch\b|\bmodel(ing|er)\b|statistic|\bdata\b|\bquant|\bscientist\b|\beconometric)/i,
  },
  {
    points: 16,
    re: /(\bengineer\b|\bdeveloper\b|\bsoftware\b|\bscien|\btechnolog|\bsystems?\b|\bproduct manager\b|\bstrateg|\binformation\b|\bbaseball\b|\bscout)/i,
  },
  {
    points: 6,
    re: /(\bassociate\b|\bcoordinator\b|\bintern\b|\bfellow|\bassistant\b|\bmanager\b|\bspecialist\b|\bconsultant\b)/i,
  },
];

function splitKeywords(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSkillRegex(skill: string): RegExp {
  // Single-character skills (e.g. "r") get a tightened trailing lookahead so they stop matching
  // inside "R&D"/"R.D." — the generic `(?![a-z0-9])` boundary alone treats "&"/"." as a valid
  // boundary character, which false-positives constantly on baseball orgs' own department names.
  // Multi-character skills keep the original lookahead unchanged.
  const trailing = skill.length === 1 ? "(?![a-z0-9&.])" : "(?![a-z0-9])";
  return new RegExp(`(?<![a-z0-9])${escapeRegex(skill)}${trailing}`, "gi");
}

// Counts occurrences of `skill` in `haystack` using the same word-boundary regex the scorer uses,
// so a later coverage/preview feature's counts can never disagree with what actually fed the
// score. Shared single source of truth — do not reimplement this matching logic elsewhere.
export function countSkillMatches(haystack: string, skill: string): number {
  const re = buildSkillRegex(skill);
  const matches = haystack.match(re);
  return matches ? matches.length : 0;
}

function firstMatch(haystack: string, skill: string): RegExpExecArray | null {
  const re = buildSkillRegex(skill);
  return re.exec(haystack);
}

// Regex-only plain-text stripper — ui/src/lib/utils.ts's htmlToPlainText uses browser-only
// DOMParser and cannot be imported into the API. Only used for building match excerpts.
//
// Entities are decoded BEFORE tags are stripped, not after: Greenhouse's own `?content=true` API
// double-encodes its `content` field (its literal characters are "&lt;p&gt;...", not "<p>...",
// confirmed live against the real API) — stripping tags first finds none (there are no literal
// "<" characters yet), then decoding reveals unstripped "<p>" tag text in the final output.
// Decoding first turns "&lt;p&gt;" into a real "<p>" tag in time for the tag-strip pass to catch it,
// and is a no-op for normal single-encoded HTML that has no entities to decode in the first place.
function stripHtml(html: string): string {
  const decoded = html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
  return decoded
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildExcerpt(text: string, index: number, matchLength: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(text.length, index + matchLength + 60);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

export function computeFitScore(posting: FitScorePosting, profile: FitScoreProfile): FitScoreResult {
  const plainDescription = stripHtml(posting.description ?? "");
  const plainTitle = stripHtml(posting.title ?? "");

  const reasons: FitScoreReason[] = [];
  const evidence: FitScoreEvidence[] = [];
  let score = 0;

  // roleSignal: graduated, title only — org names and description boilerplate pollute a role
  // judgment. First matching tier wins (most specific checked first).
  for (const tier of ROLE_TIERS) {
    if (tier.re.test(plainTitle)) {
      score += tier.points;
      reasons.push({ kind: "role", label: "Title role signal", points: tier.points });
      break;
    }
  }

  // skills: mt = weighted matches in the title, md = weighted+frequency-damped matches in the
  // description. w = 3 for core skills, 1 for secondary. Both terms are saturating fractions
  // bounded by matched skills only, so an unmatched skill added to the profile never moves the
  // score (monotonicity).
  const coreSkills = splitKeywords(profile.coreSkills);
  const secondarySkills = splitKeywords(profile.skills).filter((s) => !coreSkills.includes(s));

  const matchedSkills: string[] = [];
  let mt = 0;
  let md = 0;

  const scoreSkill = (skill: string, weight: number) => {
    let matchedAny = false;

    const titleMatch = firstMatch(plainTitle, skill);
    if (titleMatch) {
      mt += weight;
      matchedAny = true;
      evidence.push({ term: skill, excerpt: buildExcerpt(plainTitle, titleMatch.index, titleMatch[0].length) });
    }

    const occurrences = countSkillMatches(plainDescription, skill);
    if (occurrences > 0) {
      md += weight * Math.min(1 + Math.log2(Math.min(occurrences, 8)), 3);
      matchedAny = true;
      if (!titleMatch) {
        const descMatch = firstMatch(plainDescription, skill);
        if (descMatch) {
          evidence.push({ term: skill, excerpt: buildExcerpt(plainDescription, descMatch.index, descMatch[0].length) });
        }
      }
    }

    if (matchedAny) matchedSkills.push(skill);
  };

  for (const skill of coreSkills) scoreSkill(skill, 3);
  for (const skill of secondarySkills) scoreSkill(skill, 1);

  const titlePoints = 12 * (mt / (mt + 2));
  const descPoints = 22 * (md / (md + 6));
  if (mt > 0) {
    reasons.push({ kind: "skill", label: "Skills matched in title", points: Math.round(titlePoints * 10) / 10 });
  }
  if (md > 0) {
    reasons.push({ kind: "skill", label: "Skills matched in description", points: Math.round(descPoints * 10) / 10 });
  }
  score += titlePoints + descPoints;

  // semantic: cosine similarity between precomputed embeddings, contributes 0 when either is
  // missing (unbackfilled posting, or a profile that's never been saved since this feature
  // shipped) — never a penalty for missing data, same philosophy as the skill terms above.
  if (posting.embedding && profile.embedding) {
    try {
      const postingVec = JSON.parse(posting.embedding) as number[];
      const profileVec = JSON.parse(profile.embedding) as number[];
      const similarity = Math.max(0, cosineSimilarity(postingVec, profileVec));
      if (similarity > 0) {
        const semanticPoints = 12 * similarity;
        score += semanticPoints;
        reasons.push({ kind: "semantic", label: "Semantic similarity to your profile", points: Math.round(semanticPoints * 10) / 10 });
      }
    } catch {
      // Malformed stored embedding (shouldn't happen outside manual DB edits) — skip, don't throw.
    }
  }

  // locationSignal
  const locationKeywords = splitKeywords(profile.locationKeywords);
  const location = (posting.location ?? "").toLowerCase();
  if (location && locationKeywords.some((kw) => location.includes(kw))) {
    score += 6;
    reasons.push({ kind: "location", label: "Location matches a preferred location", points: 6 });
  }

  // excludeHits — checked against title + description (not organization, which is never
  // meaningfully an exclude term).
  const plainHaystack = `${plainTitle} ${plainDescription}`.toLowerCase();
  const excludeKeywords = splitKeywords(profile.excludeKeywords);
  const excludeHits = excludeKeywords.filter((kw) => plainHaystack.includes(kw));
  if (excludeHits.length > 0) {
    const penalty = Math.min(40, 20 * excludeHits.length);
    score -= penalty;
    reasons.push({
      kind: "exclude",
      label: `Matched ${excludeHits.length} exclude keyword${excludeHits.length === 1 ? "" : "s"}`,
      points: -penalty,
    });
  }

  // educationPenalty — one-directional: only penalizes when the posting requires MORE education
  // than your profile states you have. No bonus for being "overqualified," and no effect at all
  // when either side is unset (an unclassified posting, or a profile that hasn't set a level yet).
  if (
    posting.educationRequirement &&
    profile.highestEducationLevel &&
    EDUCATION_RANK[posting.educationRequirement] > EDUCATION_RANK[profile.highestEducationLevel]
  ) {
    score -= 15;
    reasons.push({ kind: "exclude", label: "Requires more education than you have", points: -15 });
  }

  score = Math.round(Math.min(100, Math.max(0, score)));

  return { score, tier: fitTier(score), matchedSkills: [...new Set(matchedSkills)], reasons, evidence };
}
