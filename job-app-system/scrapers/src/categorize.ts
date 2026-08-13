import type { NormalizedPosting } from "./types.js";

export const MLB_ORG_HINTS = [
  "baseball",
  "mlb",
  "cubs",
  "astros",
  "blue jays",
  "brewers",
  "reds",
  "white sox",
  "dodgers",
  "pirates",
  "orioles",
  "guardians",
  "athletics",
  "yankees",
  "red sox",
  "mets",
  "phillies",
  "braves",
  "cardinals",
  "giants",
  "padres",
  "rangers",
  "mariners",
  "angels",
  "rays",
  "twins",
  "royals",
  "tigers",
  "rockies",
  "marlins",
  "nationals",
  "diamondbacks",
];

// Whether `organization` (only — not title/description) is an MLB team/org, per the curated
// hint list above. Deliberately scoped to organization alone: this answers "which COMPANY
// posted this job," not "what is this role about" — a non-baseball org's posting whose title or
// description happens to mention a team name (e.g. "Rangers") shouldn't count. This is a
// separate, additional export from categorize()'s own internal full-haystack (title+org+
// description) isBaseballOrg check used for category assignment — the two intentionally answer
// different questions, and categorize()'s logic is left exactly as-is to avoid any risk of
// changing its category-assignment behavior.
export function isMlbOrg(organization: string): boolean {
  const haystack = organization.toLowerCase();
  return MLB_ORG_HINTS.some((hint) => haystack.includes(hint));
}

export function categorize(
  title: string,
  organization: string,
  description?: string
): NormalizedPosting["category"] {
  const haystack = `${title} ${organization} ${description ?? ""}`.toLowerCase();
  const isBaseballOrg = MLB_ORG_HINTS.some((hint) => haystack.includes(hint));

  if (isBaseballOrg) {
    // Bare "development" is deliberately excluded from the R&D check — it over-matches
    // business/sponsorship development roles that have nothing to do with baseball R&D.
    if (/(r&d|research and development|\bresearch\b|biomech)/.test(haystack)) return "BASEBALL_RND";
    if (/(analytics|data scien|quant|analyst)/.test(haystack)) return "BASEBALL_ANALYTICS";
    if (/(operations|\bops\b|scouting|player development)/.test(haystack)) return "BASEBALL_OPS";
    // No positive department signal — this is a real team job, but nothing suggests it's a
    // front-office/baseball-ops role (ushers, ticket sales, security, retail, grounds crew, etc.
    // all land here). Bucketing these as BASEBALL_OPS by default was a real bug: it buried the
    // Discovery feed's BASEBALL_OPS tag under generic team-support roles. OTHER is the correct
    // bucket for "real team job, not a front-office one" — no need for a separate, always-
    // incomplete exclusion keyword list.
    return "OTHER";
  }

  // Title-only, deliberately — not the full haystack. Many data-heavy-industry employers
  // (health-data, fintech, analytics-as-a-service) write "data"/"analytics" into their company
  // boilerplate on EVERY posting's description regardless of the actual role, e.g. Clover
  // Health/Flatiron Health tagged "Medical Assistant" and "Buyer" as DATA_SCIENCE before this fix
  // purely from generic company-description text. Same reasoning fitScore.ts's roleSignal
  // already documents for scoping to title: org/description text pollutes a role judgment.
  // Spot-checked against real data before narrowing this: Airbnb/Tesla/Campbell Soup's correctly-
  // tagged DATA_SCIENCE postings all carry the signal in the title itself, so this doesn't lose
  // real matches — it only drops the false positives that had none.
  if (/(data scien|data analy|machine learning|ml engineer|analytics)/.test(title.toLowerCase())) {
    return "DATA_SCIENCE";
  }

  return "OTHER";
}
