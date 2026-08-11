import type { PostingCategory } from "@/api/types";

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
