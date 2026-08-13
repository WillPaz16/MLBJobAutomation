import type { Application, ApplicationStage } from "../api/types";

// Fixes the "reorder corrupts hidden cards under a category filter" bug: Pipeline.tsx's
// `sortedByColumn` (and therefore its drag/move handlers, pre-fix) derived new `order` integers
// from the CATEGORY-FILTERED visible list, colliding with hidden cards' existing `order` values
// the moment the filter was cleared. This module separates the two concerns: *where in the
// visible list a card was dropped* (a UI-only fact) from *what order value that means in the real,
// unfiltered column* (a persistence fact). Callers must always pass the full, unfiltered
// `applications` array as `all` — never the filtered view — precisely so this can't happen again.
export function reorderWithinStage(
  all: Application[],
  movedId: string,
  destStage: ApplicationStage,
  beforeId: string | null
): { updated: Application[]; changedIds: Set<string> } {
  const moved = all.find((a) => a.id === movedId);
  if (!moved) return { updated: all, changedIds: new Set() };

  const sourceStage = moved.stage;
  const changedIds = new Set<string>();

  // Full (unfiltered) destination column, sorted by order then tie-broken by id so pre-existing
  // duplicate-order rows sort deterministically instead of depending on array insertion order.
  const fullDest = all
    .filter((a) => a.stage === destStage && a.id !== movedId)
    .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));

  // Look up the drop target's index in the FULL column, not the filtered/visible one.
  const insertAt = beforeId === null ? fullDest.length : Math.max(0, fullDest.findIndex((a) => a.id === beforeId));
  const resolvedInsertAt = insertAt === -1 ? fullDest.length : insertAt;

  fullDest.splice(resolvedInsertAt, 0, { ...moved, stage: destStage });

  const reindexedDest = fullDest.map((a, index) => {
    if (a.id === movedId || a.order !== index || a.stage !== destStage) changedIds.add(a.id);
    return { ...a, order: index, stage: destStage };
  });

  const byId = new Map(reindexedDest.map((a) => [a.id, a]));

  if (sourceStage !== destStage) {
    // Compact the FULL source column too, since it just lost a card — this is the second bug
    // fixed for free: moveStage previously never re-sequenced the column a card left, leaving a
    // permanent gap in its order values.
    const fullSource = all
      .filter((a) => a.stage === sourceStage && a.id !== movedId)
      .sort((a, b) => (a.order - b.order) || a.id.localeCompare(b.id));
    const reindexedSource = fullSource.map((a, index) => {
      if (a.order !== index) changedIds.add(a.id);
      return { ...a, order: index };
    });
    for (const a of reindexedSource) byId.set(a.id, a);
  }

  const updated = all.map((a) => byId.get(a.id) ?? a);
  return { updated, changedIds };
}
