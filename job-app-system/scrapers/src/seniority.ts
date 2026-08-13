import { classifyIsInternship } from "./internship.js";

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

  // Internships are their own axis (Posting.isInternship, classified separately in
  // internship.ts) — not a rung on the seniority ladder. They used to fall into ENTRY here,
  // which conflated "genuinely entry-level, full-time, on the professional ladder" with "a
  // student internship" — two different things you'd want to filter independently (e.g. "entry
  // level, not an internship" is a real, common search that couldn't be expressed once both
  // were the same bucket). An internship's seniority is now null ("not applicable") unless an
  // earlier EXECUTIVE/SENIOR signal already matched above (e.g. a title like "Senior Fellow
  // Program Lead" that happens to be structured as an internship still reads as SENIOR).
  if (classifyIsInternship(titleOnly)) {
    return null;
  }

  // ENTRY: title-only — explicitly junior/entry-track titles, excluding internships (handled above).
  if (
    /\b(entry.level|associate|coordinator|assistant|apprentice|new grad(uate)?|early career|university grad|campus|class of 20\d\d|recent grad)\b/i.test(
      titleOnly
    )
  ) {
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
