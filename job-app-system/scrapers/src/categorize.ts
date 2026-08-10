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

export function categorize(title: string, organization: string): NormalizedPosting["category"] {
  const haystack = `${title} ${organization}`.toLowerCase();
  const isBaseballOrg = BASEBALL_ORG_HINTS.some((hint) => haystack.includes(hint));

  if (isBaseballOrg) {
    if (/(r&d|research|development|biomech)/.test(haystack)) return "BASEBALL_RND";
    if (/(analytics|data scien|quant|analyst)/.test(haystack)) return "BASEBALL_ANALYTICS";
    if (/(operations|ops|scouting|player dev)/.test(haystack)) return "BASEBALL_OPS";
    return "BASEBALL_OPS";
  }

  if (/(data scien|data analy|machine learning|ml engineer|analytics)/.test(haystack)) {
    return "DATA_SCIENCE";
  }

  return "OTHER";
}
