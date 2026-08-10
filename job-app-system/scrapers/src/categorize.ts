import type { NormalizedPosting } from "./types.js";

const BASEBALL_ORG_HINTS = [
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

export function categorize(
  title: string,
  organization: string,
  description?: string
): NormalizedPosting["category"] {
  const haystack = `${title} ${organization} ${description ?? ""}`.toLowerCase();
  const isBaseballOrg = BASEBALL_ORG_HINTS.some((hint) => haystack.includes(hint));

  if (isBaseballOrg) {
    // Bare "development" is deliberately excluded from the R&D check — it over-matches
    // business/sponsorship development roles that have nothing to do with baseball R&D.
    if (/(r&d|research and development|\bresearch\b|biomech)/.test(haystack)) return "BASEBALL_RND";
    if (/(analytics|data scien|quant|analyst)/.test(haystack)) return "BASEBALL_ANALYTICS";
    if (/(operations|\bops\b|scouting|player development)/.test(haystack)) return "BASEBALL_OPS";
    return "BASEBALL_OPS";
  }

  if (/(data scien|data analy|machine learning|ml engineer|analytics)/.test(haystack)) {
    return "DATA_SCIENCE";
  }

  return "OTHER";
}
