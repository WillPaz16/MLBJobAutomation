import { describe, expect, it } from "vitest";
import { createApplication, createPosting, createStageEvent } from "./helpers.js";
import { findStalledApplications, isApplicationStalled, STALLED_DAYS_THRESHOLD } from "../src/applicationStaleness.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("isApplicationStalled", () => {
  it("is false for stages a follow-up nudge doesn't apply to", () => {
    const old = new Date(Date.now() - (STALLED_DAYS_THRESHOLD + 5) * DAY_MS);
    expect(isApplicationStalled({ stage: "FOUND", updatedAt: old, stageEvents: [] })).toBe(false);
    expect(isApplicationStalled({ stage: "OFFER", updatedAt: old, stageEvents: [] })).toBe(false);
    expect(isApplicationStalled({ stage: "REJECTED", updatedAt: old, stageEvents: [] })).toBe(false);
  });

  it("uses the most recent stage event, not updatedAt, when both exist", () => {
    const oldUpdatedAt = new Date(Date.now() - (STALLED_DAYS_THRESHOLD + 5) * DAY_MS);
    const recentStageEvent = new Date();
    expect(
      isApplicationStalled({
        stage: "APPLIED",
        updatedAt: oldUpdatedAt,
        stageEvents: [{ createdAt: recentStageEvent }],
      })
    ).toBe(false);
  });

  it("falls back to updatedAt when there is no stage event", () => {
    const old = new Date(Date.now() - (STALLED_DAYS_THRESHOLD + 5) * DAY_MS);
    expect(isApplicationStalled({ stage: "REVIEWING", updatedAt: old, stageEvents: [] })).toBe(true);
  });

  it("is false just under the threshold and true just over it", () => {
    const justUnder = new Date(Date.now() - (STALLED_DAYS_THRESHOLD - 1) * DAY_MS);
    const justOver = new Date(Date.now() - (STALLED_DAYS_THRESHOLD + 1) * DAY_MS);
    expect(isApplicationStalled({ stage: "INTERVIEW", updatedAt: justUnder, stageEvents: [] })).toBe(false);
    expect(isApplicationStalled({ stage: "INTERVIEW", updatedAt: justOver, stageEvents: [] })).toBe(true);
  });
});

describe("findStalledApplications", () => {
  it("finds an application whose latest stage event is old, and excludes a recently-moved one", async () => {
    const posting = await createPosting();
    const stalled = await createApplication(posting.id, { stage: "APPLIED" });
    await createStageEvent(stalled.id, {
      toStage: "APPLIED",
      createdAt: new Date(Date.now() - (STALLED_DAYS_THRESHOLD + 3) * DAY_MS),
    });

    const fresh = await createApplication(posting.id, { stage: "APPLIED" });
    await createStageEvent(fresh.id, { toStage: "APPLIED", createdAt: new Date() });

    const result = await findStalledApplications();
    const ids = result.map((a) => a.id);
    expect(ids).toContain(stalled.id);
    expect(ids).not.toContain(fresh.id);
  });
});
