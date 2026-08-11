// Deterministic keyword-based fit scoring, deliberately not ML/embedding-based (see CLAUDE.md's
// documented decision to defer semantic matching).
//
// score = clamp(0, 100,
//     roleSignal        // 0 | 40   title-only regex match
//   + categorySignal    // 0 | 20   category in preferredCategories
//   + 30 * m/(m + 3)    // skills, saturating; m = 3*(core matches) + 1*(secondary matches)
//   + locationSignal    // 0 | 10
//   - 25 * excludeHits
// )
//
// The skill term is bounded by 30 and depends only on what matched, never on profile size —
// adding a skill to the profile is monotonically non-harmful. Most discriminative power lives in
// roleSignal, which is title-only and so works even on postings with no description. Reuses
// scrapers/src/categorize.ts's established haystack-regex-matching convention.

export interface FitScorePosting {
  title: string;
  organization: string;
  category?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface FitScoreProfile {
  skills: string;
  coreSkills?: string | null;
  preferredCategories?: string | null;
  locationKeywords?: string | null;
  excludeKeywords?: string | null;
}

export interface FitScoreReason {
  kind: "role" | "category" | "skill" | "location" | "exclude";
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

const ROLE_SIGNAL_RE =
  /(\banalyst\b|analytics|data scien|\bquant|machine learning|research|\br&d\b|biomech|\bmodel(ing|er)\b|player development)/i;

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
  return new RegExp(`(?<![a-z0-9])${escapeRegex(skill)}(?![a-z0-9])`, "gi");
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
  const plainHaystack = `${plainTitle} ${posting.organization} ${plainDescription}`;

  const reasons: FitScoreReason[] = [];
  const evidence: FitScoreEvidence[] = [];
  let score = 0;

  // roleSignal: title only — org names and description boilerplate pollute a role judgment.
  if (ROLE_SIGNAL_RE.test(posting.title.toLowerCase())) {
    score += 40;
    reasons.push({ kind: "role", label: "Title matches an analyst/R&D role", points: 40 });
  }

  // categorySignal
  const preferredCategories = splitKeywords(profile.preferredCategories);
  if (posting.category && preferredCategories.includes(posting.category.toLowerCase())) {
    score += 20;
    reasons.push({ kind: "category", label: `Category "${posting.category}" is a preferred category`, points: 20 });
  }

  // skills: m = 3*(core matches) + 1*(secondary matches), saturating 30*m/(m+3)
  const coreSkills = splitKeywords(profile.coreSkills);
  const secondarySkills = splitKeywords(profile.skills).filter((s) => !coreSkills.includes(s));

  const matchedSkills: string[] = [];
  let m = 0;

  for (const skill of coreSkills) {
    const re = buildSkillRegex(skill);
    const match = re.exec(plainHaystack);
    if (match) {
      matchedSkills.push(skill);
      m += 3;
      evidence.push({ term: skill, excerpt: buildExcerpt(plainHaystack, match.index, match[0].length) });
    }
  }
  for (const skill of secondarySkills) {
    const re = buildSkillRegex(skill);
    const match = re.exec(plainHaystack);
    if (match) {
      matchedSkills.push(skill);
      m += 1;
      evidence.push({ term: skill, excerpt: buildExcerpt(plainHaystack, match.index, match[0].length) });
    }
  }

  const skillPoints = 30 * (m / (m + 3));
  if (matchedSkills.length > 0) {
    score += skillPoints;
    reasons.push({
      kind: "skill",
      label: `Matched ${matchedSkills.length} skill${matchedSkills.length === 1 ? "" : "s"}`,
      points: Math.round(skillPoints * 10) / 10,
    });
  }

  // locationSignal
  const locationKeywords = splitKeywords(profile.locationKeywords);
  const location = (posting.location ?? "").toLowerCase();
  if (location && locationKeywords.some((kw) => location.includes(kw))) {
    score += 10;
    reasons.push({ kind: "location", label: "Location matches a preferred location", points: 10 });
  }

  // excludeHits
  const excludeKeywords = splitKeywords(profile.excludeKeywords);
  const excludeHits = excludeKeywords.filter((kw) => plainHaystack.toLowerCase().includes(kw));
  if (excludeHits.length > 0) {
    const penalty = 25 * excludeHits.length;
    score -= penalty;
    reasons.push({
      kind: "exclude",
      label: `Matched ${excludeHits.length} exclude keyword${excludeHits.length === 1 ? "" : "s"}`,
      points: -penalty,
    });
  }

  score = Math.round(Math.min(100, Math.max(0, score)));

  return { score, tier: fitTier(score), matchedSkills, reasons, evidence };
}
