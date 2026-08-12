export type WorkMode = "REMOTE" | "HYBRID" | "ONSITE";
export type Region = "USA" | "INTERNATIONAL";

// Valid two-letter USPS state/territory abbreviations. Used to disambiguate a bare
// ", XX" pattern (e.g. "New York, NY") from a Canadian province abbreviation that has the exact
// same shape (e.g. "Canada - Remote (ON, AB, BC, or NS Only)" — ON/AB/BC/NS all look like a US
// state code to a naive `, [A-Z]{2}\b` regex). See classifyRegion for how this is used.
const US_STATE_ABBREVIATIONS = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
  "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC",
]);

// Non-US countries seen in real `location` data (see the sample query in the task/skill notes).
// Deliberately not exhaustive — this is a pragmatic regex classifier, not a geocoding service; any
// country not on this list, and not otherwise matched by a US signal, falls through to `null`
// rather than being guessed. Ordered as a single alternation, longest/most-specific names first
// isn't required since these are word-boundary matches, not prefix matches.
const INTERNATIONAL_SIGNALS =
  /\b(canada|ontario|quebec|alberta|british columbia|united kingdom|\buk\b|scotland|england|ireland|india|china|japan|south korea|korea|france|brazil|germany|mexico|australia|singapore|luxembourg|sweden|norway|netherlands|spain|israel|united arab emirates|\buae\b|poland|taiwan|italy|denmark|slovenia|lithuania|colombia|argentina|chile|philippines|vietnam|thailand|indonesia|malaysia|new zealand|switzerland|austria|belgium|portugal|greece|turkey|russia|egypt|nigeria|kenya|south africa|emea|apac|abu dhabi|dubai|gurugram|bangalore|beijing|seoul|tokyo|london|paris|berlin|cologne|köln|madrid|amsterdam|stockholm|oslo|copenhagen|warsaw|dublin|edinburgh|toronto|montreal|calgary|edmonton|sydney|melbourne|vilnius|ljubljana|tel aviv|são paulo|sao paulo|mexico city|taoyuan)\b/i;

const REMOTE_RE = /\bremote\b/i;
const HYBRID_RE = /\bhybrid\b/i;

// A "looks like a real, specific place" heuristic for ONSITE: either comma-separated
// ("City, ST"/"City, Country") or the dash-separated "US-ST-City" format seen from at least one
// source (e.g. "US-WI-Milwaukee"). Deliberately loose — this only needs to distinguish "has some
// geographic shape" from "is a venue/department name with none" (e.g. "LECOM Park", "Houston
// Recruiting"), not validate the place is real.
const COMMA_PLACE_RE = /,\s*[A-Za-z.]/;
const DASH_PLACE_RE = /^[A-Za-z]{2,3}-[A-Za-z]{2}-[A-Za-z]/;

/**
 * Classifies a posting's work mode from its `location` string (and optionally `description`).
 *
 * REMOTE and ONSITE are location-only signals — `location` is where sources actually encode this
 * (e.g. "Remote - USA", "Hybrid - London, UK"), and REMOTE here is deliberately kept consistent
 * with the existing `remoteOnly` API filter's `location.contains("remote")` behavior (case-
 * insensitive on SQLite, see api/src/routes/postings.ts) so the stored field never disagrees with
 * that live substring filter.
 *
 * HYBRID is the one exception: it's rare in `location` itself and much more often stated only in
 * `description` (e.g. "This is a hybrid role..."), so `description` is checked for it specifically
 * when provided. This is a deliberate asymmetry, not an oversight — extending the same
 * description-fallback to REMOTE/ONSITE would risk disagreeing with `remoteOnly`'s location-only
 * check, which is the one thing this function must never do.
 */
export function classifyWorkMode(location: string | null, description?: string | null): WorkMode | null {
  if (location && REMOTE_RE.test(location)) return "REMOTE";
  if (location && HYBRID_RE.test(location)) return "HYBRID";
  if (description && HYBRID_RE.test(description)) return "HYBRID";

  if (location && (COMMA_PLACE_RE.test(location) || DASH_PLACE_RE.test(location))) {
    return "ONSITE";
  }

  // Venue/department names ("LECOM Park", "Houston Recruiting"), empty/null, or anything else with
  // no recognizable geographic shape — genuinely ambiguous, not forced into ONSITE.
  return null;
}

function classifySingleRegion(segment: string): Region | null {
  const s = segment.trim();
  if (!s) return null;

  // International signals are checked first and take priority over the US state-abbreviation
  // heuristic below — this is the guard for the exact false-positive the Canada case would
  // otherwise trigger: "Canada - Remote (ON, AB, BC, or NS Only)" contains ", AB" and ", NS", which
  // match `, [A-Z]{2}` just as well as a real US state would. Checking for "Canada" (and other
  // explicit international signals) first means we never even reach the state-abbreviation test
  // for a string that already declared itself Canadian.
  if (INTERNATIONAL_SIGNALS.test(s)) return "INTERNATIONAL";

  if (/\bunited states\b/i.test(s) || /\bu\.s\.a?\.?\b/i.test(s) || /\busa\b/i.test(s)) {
    return "USA";
  }

  // Dash-separated "US-ST-City" format, e.g. "US-WI-Milwaukee" — a different shape entirely from
  // the comma-separated cases below, so it needs its own check rather than relying on the
  // comma-abbreviation regex to also catch it.
  if (/^US-[A-Z]{2}-/.test(s)) return "USA";

  // Comma-followed-by-two-letter-code: only counts as a USA signal if the code is an actual USPS
  // state/territory abbreviation (not just any two capital letters) — this is what keeps Canadian
  // province codes (ON, AB, BC, NS, QC, MB, SK, NB, PE, NL, YT, NT, NU) from false-matching once
  // they reach this point (they normally won't, since the INTERNATIONAL_SIGNALS check above
  // already catches "Canada" first, but this is a second independent guard in case a string has a
  // bare province code with no accompanying "Canada" text).
  const stateMatch = s.match(/,\s*([A-Za-z]{2})\b/);
  if (stateMatch && US_STATE_ABBREVIATIONS.has(stateMatch[1].toUpperCase())) {
    return "USA";
  }

  return null;
}

/**
 * Classifies a posting's region from its `location` string. Multi-location strings
 * (semicolon-separated, e.g. "Menlo Park, CA; New York, NY") are split and each segment classified
 * independently; if every segment agrees, that region is returned (so "Menlo Park, CA; New York,
 * NY" — both USA — correctly comes back USA). If segments disagree (a hypothetical "Menlo Park,
 * CA; London, UK") the result is genuinely ambiguous and `null` is returned rather than picking the
 * first segment arbitrarily — a caller filtering by region shouldn't have a mixed-region posting
 * silently attributed to whichever segment happened to come first.
 */
export function classifyRegion(location: string | null): Region | null {
  if (!location) return null;

  const segments = location.split(";").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const results = segments.map(classifySingleRegion);
  const first = results[0];
  if (first !== null && results.every((r) => r === first)) {
    return first;
  }
  return null;
}
