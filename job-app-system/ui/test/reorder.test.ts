import { describe, expect, it } from "vitest";
import { reorderWithinStage } from "../src/lib/reorder";
import type { Application } from "../src/api/types";

function makeApp(id: string, stage: Application["stage"], order: number): Application {
  return {
    id,
    postingId: `posting-${id}`,
    stage,
    order,
    resumeDocId: null,
    coverDocId: null,
    notes: null,
    appliedAt: null,
    updatedAt: "2026-01-01T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("reorderWithinStage", () => {
  it("reorders against the FULL column, not a filtered view — hidden rows keep relative position", () => {
    // 5 apps in APPLIED, order 0-4. Only #0/#2/#4 would pass some category filter — but this
    // pure function is never given the filtered view, only the full one, which is the whole
    // point of the fix.
    const all = [
      makeApp("app-0", "APPLIED", 0),
      makeApp("app-1", "APPLIED", 1),
      makeApp("app-2", "APPLIED", 2),
      makeApp("app-3", "APPLIED", 3),
      makeApp("app-4", "APPLIED", 4),
    ];

    const { updated, changedIds } = reorderWithinStage(all, "app-4", "APPLIED", "app-0");

    const applied = updated
      .filter((a) => a.stage === "APPLIED")
      .sort((a, b) => a.order - b.order);
    expect(applied.map((a) => a.order)).toEqual([0, 1, 2, 3, 4]);
    // No duplicate order values.
    expect(new Set(applied.map((a) => a.order)).size).toBe(5);
    // app-4 moved before app-0, so the new sequence by id is: 4, 0, 1, 2, 3.
    expect(applied.map((a) => a.id)).toEqual(["app-4", "app-0", "app-1", "app-2", "app-3"]);
    // Hidden #1 and #3 kept their relative position (1 still comes before 3).
    const orderOf = (id: string) => applied.find((a) => a.id === id)!.order;
    expect(orderOf("app-1")).toBeLessThan(orderOf("app-3"));
    // changedIds contains only ids whose order/stage actually moved — app-0..app-3 all shifted by
    // one slot, and app-4 both moved position and is the moved card itself.
    expect(changedIds).toEqual(new Set(["app-4", "app-0", "app-1", "app-2", "app-3"]));
  });

  it("compacts the FULL source column on a cross-stage move (the second bug fixed for free)", () => {
    const all = [
      makeApp("f-0", "FOUND", 0),
      makeApp("f-1", "FOUND", 1),
      makeApp("f-2", "FOUND", 2),
      makeApp("r-0", "REVIEWING", 0),
    ];

    const { updated, changedIds } = reorderWithinStage(all, "f-1", "REVIEWING", null);

    const found = updated.filter((a) => a.stage === "FOUND").sort((a, b) => a.order - b.order);
    expect(found.map((a) => a.id)).toEqual(["f-0", "f-2"]);
    expect(found.map((a) => a.order)).toEqual([0, 1]); // f-2 compacted from order 2 down to 1
    expect(changedIds.has("f-2")).toBe(true);

    const reviewing = updated.filter((a) => a.stage === "REVIEWING").sort((a, b) => a.order - b.order);
    expect(reviewing.map((a) => a.id)).toEqual(["r-0", "f-1"]);
    expect(reviewing.find((a) => a.id === "f-1")?.order).toBe(1);
  });

  it("beforeId: null appends to the end of the full destination column", () => {
    const all = [
      makeApp("a", "OFFER", 0),
      makeApp("b", "OFFER", 1),
      makeApp("c", "INTERVIEW", 0),
    ];

    const { updated } = reorderWithinStage(all, "c", "OFFER", null);

    const offer = updated.filter((a) => a.stage === "OFFER").sort((a, b) => a.order - b.order);
    expect(offer.map((a) => a.id)).toEqual(["a", "b", "c"]);
    expect(offer.find((a) => a.id === "c")?.order).toBe(2);
  });
});
