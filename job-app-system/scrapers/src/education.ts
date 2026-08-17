export type EducationRequirement = "NONE" | "BACHELORS" | "MASTERS" | "PHD";

// Ranked low-to-high so the "minimum stated requirement wins" rule (see classifyEducationRequirement's
// doc comment) can just take the lowest-ranked bucket among whatever matched.
export const EDUCATION_RANK: Record<EducationRequirement, number> = {
  NONE: 0,
  BACHELORS: 1,
  MASTERS: 2,
  PHD: 3,
};

// Explicit "no degree needed" signals — a posting that says a high school diploma/GED is enough,
// or says outright that no degree is required, has NONE as its real minimum, even if a degree is
// separately mentioned as "preferred." Deliberately narrow/literal (same philosophy as
// seniority.ts's PROFESSIONAL_ROLE_HINTS comment): this is a pragmatic keyword classifier, not an
// attempt to infer "this is a trades/service role" from title alone — that inference is what
// returning `null` (below) already handles for roles with no degree language at all.
const NONE_RE =
  /\bno degree (?:is )?required\b|\bdegree not required\b|\bno degree necessary\b|\bhigh school diploma\b|\bhigh school (?:diploma|equivalent)\b|\bged\b/i;

const BACHELORS_RE = /\bbachelor'?s?\b|\bbs\/ba\b|\bundergraduate degree\b|\b4.year degree\b/i;

const PHD_RE = /\bph\.?d\b|\bdoctorate\b|\bdoctoral\b/i;

// "MS"/"M.S." is a genuinely common false-positive risk — far more often "Microsoft" shorthand
// (MS Office, MS SQL Server, MS Excel, MS Teams, MS Azure, MS-DOS, MS Windows, MS Dynamics) than
// a degree abbreviation in real posting text. Mirrors fitScore.ts's buildSkillRegex precedent for
// guarding short tokens: a negative lookahead excludes the common Microsoft-product words that
// immediately follow "MS" in practice, and a `(?![a-z0-9])` trailing boundary (not just `\b`)
// keeps it from matching inside a larger alphanumeric token like "MS365" or a version string.
const MS_PRODUCT_GUARD =
  /\bm\.?s\.?(?![a-z0-9])(?!\s*[-.]?\s*(?:office|word|excel|powerpoint|outlook|teams|sql|access|visio|project|azure|dynamics|windows|paint|365|exchange|onenote))/i;

const MASTERS_RE = new RegExp(`\\bmaster'?s?\\b|\\bmba\\b|${MS_PRODUCT_GUARD.source}`, "i");

const BUCKET_REGEXES: [EducationRequirement, RegExp][] = [
  ["NONE", NONE_RE],
  ["BACHELORS", BACHELORS_RE],
  ["MASTERS", MASTERS_RE],
  ["PHD", PHD_RE],
];

/**
 * Classifies a posting's MINIMUM required degree from its title+description — same deterministic
 * keyword-based philosophy as seniority.ts/internship.ts/location.ts: explicit regex buckets, no
 * default/catch-all, `null` for "no real signal either way" rather than guessing NONE (most
 * postings never state a degree requirement at all, and that absence should mean "unclassified,"
 * not "assumed no degree needed" — same reasoning as seniority.ts's MID-isn't-a-catch-all comment).
 *
 * Unlike seniority (title-only), degree requirements are overwhelmingly stated in body text, not
 * the title — a title rarely says "Bachelor's" the way it says "Senior" — so this checks the
 * combined title+description haystack rather than title alone.
 *
 * Precedence when multiple degree levels are mentioned in the same posting ("Bachelor's required,
 * Master's preferred", "PhD preferred, Master's required", "Bachelor's degree in a relevant field
 * (Master's a plus)"): the LOWEST-ranked bucket that matched wins, i.e. the minimum stated
 * requirement, not the highest degree mentioned. This is the deliberate choice — a job-seeker
 * filtering by education requirement is asking "can I even apply," and the real gate is the
 * minimum a candidate needs, not the aspirational/preferred credential. Concretely: "Bachelor's
 * required, Master's preferred" both match BACHELORS and MASTERS regexes; returning BACHELORS
 * (the minimum) reflects the actual gate. Returning MASTERS instead would wrongly filter out a
 * bachelor's-only candidate from a role they can genuinely apply to.
 */
export function classifyEducationRequirement(title: string, description?: string): EducationRequirement | null {
  const haystack = `${title} ${description ?? ""}`.toLowerCase();

  let best: EducationRequirement | null = null;
  for (const [bucket, re] of BUCKET_REGEXES) {
    if (re.test(haystack) && (best === null || EDUCATION_RANK[bucket] < EDUCATION_RANK[best])) {
      best = bucket;
    }
  }
  return best;
}
