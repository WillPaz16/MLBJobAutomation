import { describe, expect, it } from "vitest";
import { isLikelyDuplicateTitle } from "../src/dedupe.js";

describe("isLikelyDuplicateTitle", () => {
  it("matches the same role worded differently across platforms (real observed Royals case)", () => {
    expect(
      isLikelyDuplicateTitle(
        "Urban Youth Academy – Coordinator, Community Partnerships and Events",
        "Coordinator-Community Partnerships and Events-UYA"
      )
    ).toBe(true);
  });

  it("matches identical titles with enough meaningful words", () => {
    expect(isLikelyDuplicateTitle("Senior Baseball Data Analyst", "Senior Baseball Data Analyst")).toBe(true);
  });

  it("does not match identical but too-short titles (below the minimum shared-token floor)", () => {
    // Two words isn't enough signal on its own to call it a cross-source duplicate — this guards
    // against titles too generic to trust a match on, even when they're literally identical.
    expect(isLikelyDuplicateTitle("Data Analyst", "Data Analyst")).toBe(false);
  });

  it("does not match unrelated titles at the same org", () => {
    expect(isLikelyDuplicateTitle("Security Patrol Officer I", "Analyst, Player Development - Research & Development")).toBe(
      false
    );
  });

  it("does not match short generic titles on weak overlap", () => {
    expect(isLikelyDuplicateTitle("Ticket Sales Associate", "Ticket Sales Representative")).toBe(false);
  });
});
