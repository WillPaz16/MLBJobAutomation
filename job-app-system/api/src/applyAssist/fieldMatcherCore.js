// Apply-assist field matcher — the core scoring/assignment algorithm shared between:
//   1. Normal Node/TS import (used by generateScript.ts and this module's own unit tests), and
//   2. Verbatim string embedding into the generated userscript (see generateScript.ts), which has
//      no bundler and runs as plain JS in a userscript-manager's isolated world.
//
// To satisfy both without duplicating the algorithm, this file is plain JS (no TS type syntax,
// so it's directly embeddable) using only `export function`/`export const` at the top level —
// generateScript.ts reads this file's raw text and strips the leading `export ` keyword from each
// top-level declaration line (a single, mechanical, easy-to-verify transform) to produce a plain
// script body with no import/export statements at all. Keep every top-level declaration on its own
// `export function ...` / `export const ... =` line for that strip to work — don't reformat this
// file to multi-line export statements or destructured exports.
//
// Scoring policy (see CLAUDE.md / the v8 plan's Phase 6 section for the full rationale): each
// (form-field, target) pair is scored by the single highest-trust signal that matches — signals are
// NOT summed, because a field that merely *contains* a low-trust hint (placeholder) alongside a
// real autocomplete mismatch shouldn't out-rank a clean autocomplete match elsewhere. Two
// deliberately asymmetric thresholds: score >= FILL_THRESHOLD actually fills the field; score in
// [FLAG_THRESHOLD, FILL_THRESHOLD) does NOT fill — it's surfaced as "low confidence" only; anything
// below FLAG_THRESHOLD is ignored entirely. A wrong autofill is worse than a missing one, since a
// wrong one can be submitted unnoticed — never collapse this into one threshold.

export const SCORE_AUTOCOMPLETE = 100;
export const SCORE_NAME_ID = 60;
export const SCORE_LABEL_EXACT = 50;
export const SCORE_LABEL_FUZZY = 30;
export const SCORE_ARIA = 25;
export const SCORE_PLACEHOLDER = 10;

export const FILL_THRESHOLD = 50;
export const FLAG_THRESHOLD = 20;

// Same Jaccard-token-overlap *idea* as scrapers/src/dedupe.ts's isLikelyDuplicateTitle (read that
// file for the precedent) — reimplemented here rather than imported, since this module must stay
// dependency-free and portable into a userscript with no bundler, and dedupe.ts's threshold/stopword
// tuning is specific to job-title matching, not form-label matching.
const STOPWORDS = new Set(["and", "the", "of", "a", "an", "for", "to", "in", "at", "on", "&", "or"]);

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

export function jaccardSimilarity(textA, textB) {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const shared = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  return shared.length / union.size;
}

// Used for label/aria/placeholder fuzzy matching instead of plain Jaccard: a verbose real-world
// label ("Your legal first name here") containing every token of a short target label ("First
// name") should score as a strong match even though the union (and so the Jaccard score) is
// dragged down by the label's extra words. Overlap coefficient (shared / smaller-set-size) isn't
// fooled by that asymmetry. jaccardSimilarity above is kept as-is for matchOptionLabel, where both
// sides are typically comparable-length option text, not a long sentence vs a short target label.
function overlapCoefficient(textA, textB) {
  const tokensA = new Set(tokenize(textA));
  const tokensB = new Set(tokenize(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const shared = [...tokensA].filter((t) => tokensB.has(t));
  return shared.length / Math.min(tokensA.size, tokensB.size);
}

// Sensitive fields must NEVER be filled, matched, or even scored — checked by both DOM `type` and a
// name/id pattern denylist, erring toward over-excluding. This list is intentionally broad.
export const SENSITIVE_TYPES = new Set(["password", "hidden", "file"]);

export const SENSITIVE_NAME_PATTERN =
  /password|passwd|pwd|ssn|social[-_ ]?security|credit[-_ ]?card|card[-_ ]?number|cvv|cvc|cvv2|security[-_ ]?code|routing[-_ ]?number|account[-_ ]?number|bank[-_ ]?account|iban|swift|sort[-_ ]?code|pin[-_ ]?number/i;

export function isSensitiveField(descriptor) {
  const type = String(descriptor.type || "").toLowerCase();
  if (SENSITIVE_TYPES.has(type)) return true;
  const haystack = `${descriptor.name || ""} ${descriptor.id || ""}`;
  return SENSITIVE_NAME_PATTERN.test(haystack);
}

// Target field definitions: what an ApplicantIdentity/apply-pack payload can fill. `kind` is "text"
// for plain fill-in-the-blank fields, or "option" for select/radio groups matched by visible label
// text (EEO + yes/no fields) via matchOptionLabel below. `isEEO` drives the distinct "flag for
// review" visual treatment in the generated script — EEO fields are always autofilled *if* matched,
// never silently skipped, but always flagged, per the confirmed "autofill but flag for review" call.
export const TARGET_FIELDS = [
  { key: "legalFirstName", label: "First name", kind: "text", autocomplete: ["given-name"], namePattern: /\bfirst[-_ ]?name\b|\bfname\b/i },
  { key: "legalMiddleName", label: "Middle name", kind: "text", autocomplete: ["additional-name"], namePattern: /\bmiddle[-_ ]?name\b/i },
  { key: "legalLastName", label: "Last name", kind: "text", autocomplete: ["family-name"], namePattern: /\blast[-_ ]?name\b|\bsurname\b|\blname\b/i },
  { key: "preferredName", label: "Preferred name", kind: "text", autocomplete: ["nickname"], namePattern: /\bpreferred[-_ ]?name\b|\bnickname\b/i },
  { key: "email", label: "Email", kind: "text", autocomplete: ["email"], namePattern: /\be[-_]?mail\b/i },
  { key: "phone", label: "Phone", kind: "text", autocomplete: ["tel", "tel-national"], namePattern: /\bphone\b|\bmobile\b|\btelephone\b/i },
  { key: "addressStreet", label: "Street address", kind: "text", autocomplete: ["street-address", "address-line1"], namePattern: /\baddress\b|\bstreet\b/i },
  { key: "addressCity", label: "City", kind: "text", autocomplete: ["address-level2"], namePattern: /\bcity\b/i },
  { key: "addressState", label: "State", kind: "text", autocomplete: ["address-level1"], namePattern: /\bstate\b|\bprovince\b/i },
  { key: "addressZip", label: "Zip / postal code", kind: "text", autocomplete: ["postal-code"], namePattern: /\bzip\b|\bpostal\b/i },
  { key: "addressCountry", label: "Country", kind: "text", autocomplete: ["country-name", "country"], namePattern: /\bcountry\b/i },
  { key: "linkedinUrl", label: "LinkedIn URL", kind: "text", autocomplete: [], namePattern: /linked[-_ ]?in/i },
  { key: "portfolioUrl", label: "Portfolio / website URL", kind: "text", autocomplete: ["url"], namePattern: /\bportfolio\b|\bwebsite\b|\bpersonal[-_ ]?site\b/i },
  { key: "githubUrl", label: "GitHub URL", kind: "text", autocomplete: [], namePattern: /git[-_ ]?hub/i },
  { key: "dateOfBirth", label: "Date of birth", kind: "text", autocomplete: ["bday"], namePattern: /date[-_ ]?of[-_ ]?birth|\bdob\b|birth[-_ ]?date/i },
  { key: "authorizedToWorkUs", label: "Authorized to work in the US", kind: "option", autocomplete: [], namePattern: /authoriz(e|ation).{0,20}work|work.{0,20}authoriz/i, isEEO: false },
  { key: "requiresSponsorship", label: "Requires visa sponsorship", kind: "option", autocomplete: [], namePattern: /sponsorship|\bvisa\b/i, isEEO: false },
  { key: "genderIdentityLabel", label: "Gender identity", kind: "option", autocomplete: ["sex"], namePattern: /\bgender\b|\bsex\b/i, isEEO: true },
  { key: "raceEthnicityLabel", label: "Race / ethnicity", kind: "option", autocomplete: [], namePattern: /race|ethnicity/i, isEEO: true },
  { key: "disabilityStatusLabel", label: "Disability status", kind: "option", autocomplete: [], namePattern: /disabilit/i, isEEO: true },
  { key: "veteranStatusLabel", label: "Veteran status", kind: "option", autocomplete: [], namePattern: /veteran|military[-_ ]?service/i, isEEO: true },
];

// Scores one (fieldDescriptor, target) pair. Descriptor shape (all optional strings except type):
// { autocomplete, name, id, labelText, ariaText, placeholder, type }. Returns the single highest
// applicable signal's score — signals are not summed (see the file-header rationale).
export function scoreField(descriptor, target) {
  const autocomplete = String(descriptor.autocomplete || "").toLowerCase().trim();
  if (autocomplete && target.autocomplete.includes(autocomplete)) return SCORE_AUTOCOMPLETE;

  // Underscore/hyphen-delimited attribute values ("applicant_first_name") don't contain a regex
  // word boundary between the delimiter and the following letter (both are \w for `\b`'s
  // purposes) — normalize delimiters to spaces first so the same `\bfirst[-_ ]?name\b`-style
  // patterns work whether the real attribute uses snake_case, kebab-case, or camel/plain words.
  const nameIdHaystack = `${descriptor.name || ""} ${descriptor.id || ""}`.replace(/[-_]/g, " ");
  if (target.namePattern && target.namePattern.test(nameIdHaystack)) return SCORE_NAME_ID;

  if (descriptor.labelText) {
    const normalizedLabel = descriptor.labelText.trim().toLowerCase();
    if (normalizedLabel === target.label.toLowerCase()) return SCORE_LABEL_EXACT;
    if (overlapCoefficient(descriptor.labelText, target.label) >= 0.5) return SCORE_LABEL_FUZZY;
  }

  if (descriptor.ariaText && overlapCoefficient(descriptor.ariaText, target.label) >= 0.5) {
    return SCORE_ARIA;
  }

  if (descriptor.placeholder && overlapCoefficient(descriptor.placeholder, target.label) >= 0.34) {
    return SCORE_PLACEHOLDER;
  }

  return 0;
}

// Greedily assigns each field to at most one target (and vice versa), highest score first. Returns
// one entry per field descriptor index that scored > 0 against at least one target, with a `tier`
// of "fill" (>= FILL_THRESHOLD), "flag" (>= FLAG_THRESHOLD), or "ignore" (below FLAG_THRESHOLD —
// callers should drop these, they're returned only so tests can assert the boundary).
export function assignFields(descriptors, targets) {
  const candidates = [];
  descriptors.forEach((descriptor, fieldIndex) => {
    if (isSensitiveField(descriptor)) return;
    targets.forEach((target) => {
      const score = scoreField(descriptor, target);
      if (score > 0) candidates.push({ fieldIndex, targetKey: target.key, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score);

  const usedFields = new Set();
  const usedTargets = new Set();
  const assignments = [];
  for (const candidate of candidates) {
    if (usedFields.has(candidate.fieldIndex) || usedTargets.has(candidate.targetKey)) continue;
    usedFields.add(candidate.fieldIndex);
    usedTargets.add(candidate.targetKey);
    const tier = candidate.score >= FILL_THRESHOLD ? "fill" : candidate.score >= FLAG_THRESHOLD ? "flag" : "ignore";
    assignments.push({ ...candidate, tier });
  }
  return assignments;
}

// Select/radio-group option matching: compares a stored "*Label" value (e.g. "Female",
// "Yes, I have a disability...") against each option's visible text via the same token-overlap
// idea as jaccardSimilarity above. Returns the index of the best-matching option, or -1 if nothing
// clears the threshold (callers should treat -1 as "leave the field alone / flag as unmatched").
const OPTION_MATCH_THRESHOLD = 0.34;

export function matchOptionLabel(optionTexts, storedLabel) {
  if (!storedLabel) return -1;
  let bestIndex = -1;
  let bestScore = 0;
  optionTexts.forEach((text, index) => {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return;
    if (normalized === storedLabel.trim().toLowerCase()) {
      bestIndex = index;
      bestScore = 1;
      return;
    }
    const score = jaccardSimilarity(text, storedLabel);
    if (score > bestScore && score >= OPTION_MATCH_THRESHOLD) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}
