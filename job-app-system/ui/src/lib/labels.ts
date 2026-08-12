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
  aaimtrack: "aaimtrack",
  teamworkonline: "TeamWork Online",
  dayforce: "Dayforce",
  team_page: "Team page",
  manual: "Manual",
};

// Generic fallback for labels that aren't a fixed enum with a curated map (e.g. Analytics'
// by-stage/by-source breakdowns, where "source" keys are open-ended ATS platform strings) —
// "team_page" -> "Team Page", "REVIEWING" -> "Reviewing". Prefer an explicit map (like
// CATEGORY_LABELS above) wherever one exists; this is for the cases that don't have one.
export function prettifyLabel(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
