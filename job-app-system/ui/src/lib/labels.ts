import type { ApplicationStage, PostingCategory } from "@/api/types";

// Single source of truth for how a PostingCategory displays — reused by every page that renders
// a category badge (Discovery, Pipeline, Prep, Analytics) instead of each doing its own
// `.replace(/_/g, " ")`, which turned "BASEBALL_RND" into all-caps "BASEBALL RND" with no
// ampersand. Mirrors the pattern Pipeline.tsx already uses correctly for ApplicationStage via its
// own STAGE_LABELS constant.
export const CATEGORY_LABELS: Record<PostingCategory, string> = {
  BASEBALL_OPS: "Baseball Ops",
  BASEBALL_ANALYTICS: "Baseball Analytics",
  BASEBALL_RND: "Baseball R&D",
  DATA_SCIENCE: "Data Science",
  OTHER: "Other",
};

// Fixed display order for category filters/checkboxes — baseball-specific categories first
// (ops -> analytics -> R&D), then the general data-science catch-all, then "other".
export const CATEGORY_ORDER: PostingCategory[] = [
  "BASEBALL_OPS",
  "BASEBALL_ANALYTICS",
  "BASEBALL_RND",
  "DATA_SCIENCE",
  "OTHER",
];

export const CATEGORY_OPTIONS: { value: PostingCategory; label: string }[] = CATEGORY_ORDER.map(
  (value) => ({ value, label: CATEGORY_LABELS[value] })
);

export const CATEGORY_FILTER_OPTIONS: { value: PostingCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  ...CATEGORY_OPTIONS,
];

// Map form of CATEGORY_FILTER_OPTIONS (includes "all", unlike CATEGORY_LABELS above) — for the
// Select-trigger `labels` prop (components/ui/select.tsx) wherever a category filter includes the
// "all" option, so the closed trigger reads "All categories" rather than falling back to
// prettifyLabel("all") = "All".
export const CATEGORY_FILTER_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_FILTER_OPTIONS.map((o) => [o.value, o.label])
);

// Seniority is a fixed 4-value enum surfaced by the API (`Posting.seniority`) — same hardcoded
// pattern as CATEGORY_LABELS/CATEGORY_FILTER_OPTIONS above rather than a facet-driven fetch.
export const SENIORITY_LABELS: Record<string, string> = {
  ENTRY: "Entry level",
  MID: "Mid level",
  SENIOR: "Senior",
  EXECUTIVE: "Executive",
};

export const SENIORITY_ORDER: string[] = ["ENTRY", "MID", "SENIOR", "EXECUTIVE"];

export const SENIORITY_OPTIONS: { value: string; label: string }[] = SENIORITY_ORDER.map((value) => ({
  value,
  label: SENIORITY_LABELS[value],
}));

export const SENIORITY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All levels" },
  ...SENIORITY_OPTIONS,
];

// Work mode is a fixed 3-value enum surfaced by the API (`Posting.workMode`) — same hardcoded
// pattern as SENIORITY_LABELS above.
export const WORK_MODE_LABELS: Record<string, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

export const WORK_MODE_ORDER: string[] = ["REMOTE", "HYBRID", "ONSITE"];

export const WORK_MODE_OPTIONS: { value: string; label: string }[] = WORK_MODE_ORDER.map((value) => ({
  value,
  label: WORK_MODE_LABELS[value],
}));

export const WORK_MODE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All work modes" },
  ...WORK_MODE_OPTIONS,
];

// Education requirement is a fixed 4-value enum surfaced by the API
// (`Posting.educationRequirement`) — same hardcoded pattern as SENIORITY_LABELS above.
export const EDUCATION_REQUIREMENT_LABELS: Record<string, string> = {
  NONE: "No degree",
  BACHELORS: "Bachelor's",
  MASTERS: "Master's",
  PHD: "PhD",
};

export const EDUCATION_REQUIREMENT_ORDER: string[] = ["NONE", "BACHELORS", "MASTERS", "PHD"];

export const EDUCATION_REQUIREMENT_OPTIONS: { value: string; label: string }[] =
  EDUCATION_REQUIREMENT_ORDER.map((value) => ({
    value,
    label: EDUCATION_REQUIREMENT_LABELS[value],
  }));

export const EDUCATION_REQUIREMENT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "Any" },
  ...EDUCATION_REQUIREMENT_OPTIONS,
];

// isInternship is a boolean (`Posting.isInternship`) surfaced as a 3-state filter control — same
// "all" + real-value shape as WORK_MODE_FILTER_OPTIONS/REGION_FILTER_OPTIONS above, but the two
// real values are the string-coerced booleans the API's "true"/"false" query-param pattern
// expects (see api/src/routes/postings.ts), not an enum. Defaults to "all" (show both) per the
// v7 plan's "kept separable" decision — internships aren't hidden by default.
export const INTERNSHIP_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "false", label: "Full-time only" },
  { value: "true", label: "Internships only" },
];

// Region is a fixed 2-value enum surfaced by the API (`Posting.region`) — same hardcoded pattern.
export const REGION_LABELS: Record<string, string> = {
  USA: "United States",
  INTERNATIONAL: "International",
};

export const REGION_ORDER: string[] = ["USA", "INTERNATIONAL"];

export const REGION_OPTIONS: { value: string; label: string }[] = REGION_ORDER.map((value) => ({
  value,
  label: REGION_LABELS[value],
}));

export const REGION_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All regions" },
  ...REGION_OPTIONS,
];

// Discovery's top-level view tabs — a Baseball/MLB tab (isMlbTeam=true), 3 tabs for the
// SimplifyJobs new-grad list's non-MLB sourceSection values (see newGradList.ts), "all"
// (Everything — no isMlbTeam/sourceSection scoping at all, the 40-active-postings-unreachable-
// through-any-tab gap the v8 plan measured), and "data-science" (v11 Phase 3 — a category-driven
// tab: `category=DATA_SCIENCE`, independent of isMlbTeam/sourceSection, so it surfaces correctly-
// tagged DATA_SCIENCE postings from EVERY source, aggregator or direct-org, not just the
// SimplifyJobs-sourced "ds-ai-ml" tab). Keys are short and URL-friendly; values map to the
// isMlbTeam/sourceSection/category params Discovery.tsx sends to GET /api/postings.
export type DiscoveryTab = "all" | "baseball" | "ds-ai-ml" | "quant" | "pm" | "data-science";

export const DISCOVERY_TAB_LABELS: Record<DiscoveryTab, string> = {
  all: "Everything",
  baseball: "Baseball",
  "ds-ai-ml": "Data Science & AI/ML",
  quant: "Quantitative Finance",
  pm: "Product Management",
  // Deliberately distinct wording from "ds-ai-ml"'s label above — that tab is the SimplifyJobs
  // aggregator's own section, this tab is the category-driven, source-agnostic view (every
  // Posting tagged category=DATA_SCIENCE, from any adapter). "(All Sources)" is the disambiguator
  // so the two never look like duplicates in the tab bar.
  "data-science": "Data Science (All Sources)",
};

// "all" is placed FIRST (the plan's explicit placement), but FILTER_DEFAULTS.tab in Discovery.tsx
// deliberately stays "baseball" — adding tabs must not silently change the default landing view.
export const DISCOVERY_TAB_ORDER: DiscoveryTab[] = ["all", "baseball", "ds-ai-ml", "quant", "pm", "data-science"];

// The exact sourceSection string values the API expects/returns for the 3 non-baseball,
// non-"all", non-"data-science" tabs ("data-science" scopes on `category` instead — see
// DISCOVERY_TAB_CATEGORY below).
export const DISCOVERY_TAB_SOURCE_SECTIONS: Record<
  Exclude<DiscoveryTab, "baseball" | "all" | "data-science">,
  string
> = {
  "ds-ai-ml": "Data Science, AI & Machine Learning",
  quant: "Quantitative Finance",
  pm: "Product Management",
};

// The fixed Posting.category value the "data-science" tab scopes to — a plain constant (not a
// per-tab record) since it's the only tab scoped by category rather than isMlbTeam/sourceSection.
export const DISCOVERY_TAB_CATEGORY: PostingCategory = "DATA_SCIENCE";

// Moved here from Discovery.tsx (was a local const there) as part of the label consolidation —
// every Select-trigger label map now lives in one file, `optionsToLabels` doing the
// options-array -> lookup-map conversion once instead of Discovery hand-rolling its own
// `Object.fromEntries` per option list.
export function optionsToLabels<V extends string>(options: { value: V; label: string }[]): Record<string, string> {
  return Object.fromEntries(options.map((o) => [o.value, o.label]));
}

export const STATUSES: { value: "active" | "closed" | "all"; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "closed", label: "Closed only" },
  { value: "all", label: "All statuses" },
];
export const STATUS_LABELS = optionsToLabels(STATUSES);

export type DiscoverySortOption =
  | "discoveredAt_desc"
  | "discoveredAt_asc"
  | "postedAt_desc"
  | "postedAt_asc"
  | "fit_desc";

// postedAt sorts are relabeled "(where known)" rather than hidden — postedAt is null on ~90% of
// active postings today, but hiding a sort based on today's data distribution would silently rot
// as coverage improves; the parenthetical is honest about today's low coverage without removing
// the option.
export const SORTS: { value: DiscoverySortOption; label: string }[] = [
  { value: "fit_desc", label: "Best fit first" },
  { value: "discoveredAt_desc", label: "Newest found first" },
  { value: "discoveredAt_asc", label: "Oldest found first" },
  { value: "postedAt_desc", label: "Newest posted first (where known)" },
  { value: "postedAt_asc", label: "Oldest posted first (where known)" },
];
export const SORT_LABELS = optionsToLabels(SORTS);
// The Sort Select's onValueChange fallback and FILTER_DEFAULTS.sort must agree, or clearing the
// value falls back to a different sort than the one the "default" filter chip/state claims —
// both are "fit_desc" now (previously the fallback said discoveredAt_desc while the default said
// fit_desc, a real disagreement).
export const DEFAULT_SORT: DiscoverySortOption = "fit_desc";

// Thresholds match api/src/fitScore.ts's fitTier boundaries exactly (Strong>=65, Good>=40,
// Fair>=20, Weak<20) — the "or better" floor for each preset is that tier's own lower bound.
export const MIN_FIT_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Any fit" },
  { value: "20", label: "Fair or better" },
  { value: "40", label: "Good or better" },
  { value: "65", label: "Strong only" },
];
export const MIN_FIT_LABELS = optionsToLabels(MIN_FIT_OPTIONS);

// Recency filter driving the new `discoveredAfter` API param (discoveredAt is non-null on every
// active posting, unlike postedAt) — values are day counts resolved to an absolute ISO timestamp
// client-side at request time, not sent as a relative string.
export const RECENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];
export const RECENCY_LABELS = optionsToLabels(RECENCY_OPTIONS);

// The one human-facing name map for Discovery's filter chips/aria-labels — "Type" -> "Role type"
// (it means internship-vs-full-time, not a data type), "Location contains" -> "Location" (leaked
// the implementation), "Search title/org" -> "Search" (inaccurate now that Phase 2 also searches
// description), "Team / Company" -> "Team or company" (the chip renders it without spaces, so no
// ambiguous spacing to get wrong twice).
export const DISCOVERY_FILTER_NAMES: Record<string, string> = {
  category: "Category",
  seniority: "Level",
  workMode: "Work mode",
  region: "Region",
  educationRequirement: "Education requirement",
  isInternship: "Role type",
  location: "Location",
  search: "Search",
  organization: "Team or company",
  source: "ATS platform",
  status: "Status",
  sort: "Sort",
  minFit: "Minimum fit",
  discoveredAfter: "Discovered",
  excludeInPipeline: "Hide already-in-pipeline",
  matchedSkill: "Matched skill",
  hideDuplicates: "Hide flagged duplicates",
  showDismissed: "Show dismissed",
  pageSize: "Rows per page",
};

// Canonical ApplicationStage order — the single source of truth for stage sequencing across the
// app. Previously duplicated as Pipeline.tsx's STAGES, Analytics.tsx's STAGE_ORDER, and a second,
// separately-typed copy inside Analytics.tsx as funnelStageOrder (v9 Phase 6 cleanup).
export const STAGE_ORDER: ApplicationStage[] = [
  "FOUND",
  "REVIEWING",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
];

// Moved from Pipeline.tsx so every page renders ApplicationStage/source labels the same way.
export const STAGE_LABELS: Record<ApplicationStage, string> = {
  FOUND: "Found",
  REVIEWING: "Reviewing",
  APPLIED: "Applied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const SOURCE_LABELS: Record<string, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  adp: "ADP",
  ukg: "UKG",
  bamboohr: "BambooHR",
  // Searched for an official capitalization in the codebase and in scrapers/src/adapters/
  // aaimtrack.ts's own comments first — every mention is lowercase because it's always written
  // as part of the bare domain (aaimtrack.com), never as a standalone product name. No canonical
  // brand casing found, so this uses "AAIMtrack" (matching the sentence-case-with-an-internal-
  // capital convention the platform's own site header uses) as a reasonable default rather than
  // leaving it as the all-lowercase domain-fragment string, which read as unstyled/broken next to
  // "Greenhouse"/"BambooHR" on the same badge.
  aaimtrack: "AAIMtrack",
  teamworkonline: "TeamWork Online",
  dayforce: "Dayforce",
  team_page: "Team page",
  manual: "Manual",
};

// Moved to lib/utils.ts (components/ui/select.tsx needs it and shouldn't import app-domain
// labels) — re-exported here so no existing call site in this codebase needs to change.
export { prettifyLabel } from "./utils";
