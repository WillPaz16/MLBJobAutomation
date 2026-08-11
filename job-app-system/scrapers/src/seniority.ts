export type Seniority = "ENTRY" | "MID" | "SENIOR" | "EXECUTIVE";

// Roles for which "seniority" isn't a meaningful concept at all (hourly/trade/service roles like
// ushers, HVAC techs, plumbers) shouldn't be forced into MID just because they don't match any of
// the other buckets — that would silently collapse "not a professional-ladder role" into "mid-level
// professional," which is a different and wrong claim. So MID is NOT a catch-all default: it only
// fires when the haystack shows some positive signal of being a "real" professional/office-track
// role (see PROFESSIONAL_ROLE_HINTS below). Everything else falls through to null, meaning
// "unclassified" — not "assumed mid-level."
const PROFESSIONAL_ROLE_HINTS =
  /\b(analyst|engineer|scientist|manager|specialist|consultant|developer|designer|strategist|architect|administrator|counsel|attorney|accountant|controller|economist|statistician|scout|coach|coordinator of|planner)\b/i;

export function classifySeniority(title: string, description?: string): Seniority | null {
  const haystack = `${title} ${description ?? ""}`.toLowerCase();
  const titleOnly = title.toLowerCase();

  // EXECUTIVE: title-only, checked first since "director"/"vp"/"chief" outranks any lower signal
  // that might also appear (e.g. "Director of Analytics" should be EXECUTIVE, not SENIOR).
  if (/\b(vp|vice president|chief|director|head of|executive)\b/i.test(titleOnly)) {
    return "EXECUTIVE";
  }

  // SENIOR: title-only — "senior"/"sr."/"staff"/"principal"/"lead" are strong, unambiguous
  // title-level signals.
  if (/\b(senior|sr\.?|staff|principal|lead)\b/i.test(titleOnly)) {
    return "SENIOR";
  }

  // ENTRY: title-only — internships and explicitly junior/entry-track titles.
  if (/\b(intern|internship|entry.level|associate|coordinator|assistant|apprentice)\b/i.test(titleOnly)) {
    return "ENTRY";
  }

  // MID: no explicit level word, but the title (or description, as a fallback) reads as a real
  // professional/office-track role — e.g. bare "Data Analyst" or "Software Engineer" with no
  // seniority modifier defaults to MID, since those titles do imply a professional individual-
  // contributor role even without an explicit level word.
  if (PROFESSIONAL_ROLE_HINTS.test(haystack)) {
    return "MID";
  }

  // Everything else (e.g. "HVAC Technician", "Usher", "Plumber", "Grounds Crew") — seniority
  // isn't a meaningful concept for these roles, so return null ("unclassified") rather than
  // guessing MID as a default bucket.
  return null;
}
