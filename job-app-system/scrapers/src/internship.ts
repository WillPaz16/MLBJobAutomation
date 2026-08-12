// Title-only, same reasoning as isMlbOrg in categorize.ts: whether a posting is an internship is
// a property of the role itself, and title text is a reliable, stable signal for that — pulling
// in description text risks false positives from boilerplate EEO/benefits language that mentions
// "internship" programs unrelated to the specific posting.
const INTERNSHIP_RE = /\bintern(ship)?\b|summer 20\d\d|\bco-?op\b/i;

export function classifyIsInternship(title: string): boolean {
  return INTERNSHIP_RE.test(title);
}
