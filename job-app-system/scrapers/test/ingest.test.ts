import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { getOrCreateSource, ingestPostings } from "../src/ingest.js";
import type { NormalizedPosting } from "../src/types.js";

function samplePosting(overrides: Partial<NormalizedPosting> = {}): NormalizedPosting {
  return {
    externalId: "ext-1",
    title: "Data Scientist",
    organization: "TestCo",
    category: "DATA_SCIENCE",
    url: "https://example.com/job/1",
    ...overrides,
  };
}

describe("getOrCreateSource", () => {
  it("creates a source once and reuses it on a second call", async () => {
    const first = await getOrCreateSource("greenhouse", "greenhouse", { boardToken: "a" });
    const second = await getOrCreateSource("greenhouse", "greenhouse", { boardToken: "b" });
    expect(second.id).toBe(first.id);
    expect(second.config).toBe(JSON.stringify({ boardToken: "b" }));
  });
});

describe("ingestPostings", () => {
  it("inserts new postings", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    const result = await ingestPostings(source.id, [samplePosting()], "TestCo");
    expect(result).toEqual({ inserted: 1, skipped: 0, flaggedDuplicates: 0, closed: 0, reopened: 0, total: 1 });

    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].lastSeenAt).toBeInstanceOf(Date);
    expect(rows[0].closedAt).toBeNull();
  });

  it("dedupes on a second run with the same externalId — no duplicate rows, lastSeenAt refreshed", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    await ingestPostings(source.id, [samplePosting()], "TestCo");
    const second = await ingestPostings(source.id, [samplePosting()], "TestCo");

    expect(second).toEqual({ inserted: 0, skipped: 1, flaggedDuplicates: 0, closed: 0, reopened: 0, total: 1 });
    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].missedRuns).toBe(0);
  });

  it("backfills description on re-scrape when it was previously missing (fill-only)", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    await ingestPostings(source.id, [samplePosting({ description: undefined })], "TestCo");

    await ingestPostings(source.id, [samplePosting({ description: "<p>Full text</p>" })], "TestCo");
    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows[0].description).toBe("<p>Full text</p>");
  });

  it("never overwrites an existing description with an empty one from a flaky run", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    await ingestPostings(source.id, [samplePosting({ description: "<p>Good text</p>" })], "TestCo");

    await ingestPostings(source.id, [samplePosting({ description: undefined })], "TestCo");
    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows[0].description).toBe("<p>Good text</p>");
  });

  it("treats the same externalId under a different source as distinct when the title differs", async () => {
    const sourceA = await getOrCreateSource("source-a", "greenhouse", {});
    const sourceB = await getOrCreateSource("source-b", "lever", {});
    await ingestPostings(sourceA.id, [samplePosting({ organization: "OrgOne" })], "OrgOne");
    const result = await ingestPostings(
      sourceB.id,
      [samplePosting({ organization: "OrgTwo" })], // different org — no cross-source fuzzy match
      "OrgTwo"
    );

    expect(result).toEqual({ inserted: 1, skipped: 0, flaggedDuplicates: 0, closed: 0, reopened: 0, total: 1 });
  });

  it("flags (does not skip) the same job posted under a different external ID with a near-identical title", async () => {
    const sourceA = await getOrCreateSource("source-a", "teamworkonline", {});
    const sourceB = await getOrCreateSource("source-b", "dayforce", {});
    await ingestPostings(
      sourceA.id,
      [
        samplePosting({
          externalId: "tw-1",
          organization: "Kansas City Royals",
          title: "Urban Youth Academy – Coordinator, Community Partnerships and Events",
        }),
      ],
      "Kansas City Royals"
    );
    const result = await ingestPostings(
      sourceB.id,
      [
        samplePosting({
          externalId: "df-1",
          organization: "Kansas City Royals",
          title: "Coordinator-Community Partnerships and Events-UYA",
        }),
      ],
      "Kansas City Royals"
    );

    // No longer silently suppressed — both rows exist, the second flagged as a possible duplicate
    // of the first, so the user can see and confirm/reject the match instead of a job vanishing.
    expect(result).toEqual({ inserted: 1, skipped: 0, flaggedDuplicates: 1, closed: 0, reopened: 0, total: 1 });
    const rows = await prisma.posting.findMany({
      where: { organization: "Kansas City Royals" },
      orderBy: { title: "asc" },
    });
    expect(rows).toHaveLength(2);
    const flagged = rows.find((r) => r.externalId === "df-1");
    const original = rows.find((r) => r.externalId === "tw-1");
    expect(flagged?.possibleDuplicateOfId).toBe(original?.id);
    expect(original?.possibleDuplicateOfId).toBeNull();
  });

  it("does not flag genuinely different jobs at the same org", async () => {
    const sourceA = await getOrCreateSource("source-a", "teamworkonline", {});
    const sourceB = await getOrCreateSource("source-b", "dayforce", {});
    await ingestPostings(
      sourceA.id,
      [samplePosting({ externalId: "tw-2", organization: "Arizona Diamondbacks", title: "Security Patrol Officer I" })],
      "Arizona Diamondbacks"
    );
    const result = await ingestPostings(
      sourceB.id,
      [
        samplePosting({
          externalId: "df-2",
          organization: "Arizona Diamondbacks",
          title: "Analyst, Player Development - Research & Development",
        }),
      ],
      "Arizona Diamondbacks"
    );

    expect(result).toEqual({ inserted: 1, skipped: 0, flaggedDuplicates: 0, closed: 0, reopened: 0, total: 1 });
  });

  it("inserts new postings and skips known ones within the same mixed batch", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    await ingestPostings(source.id, [samplePosting({ externalId: "ext-1" })], "TestCo");

    const result = await ingestPostings(
      source.id,
      [samplePosting({ externalId: "ext-1" }), samplePosting({ externalId: "ext-2", title: "Machine Learning Engineer" })],
      "TestCo"
    );

    expect(result).toEqual({ inserted: 1, skipped: 1, flaggedDuplicates: 0, closed: 0, reopened: 0, total: 2 });
  });

  describe("active/inactive tracking", () => {
    it("does not close a posting missing from just one run", async () => {
      const source = await getOrCreateSource("test-source", "greenhouse", {});
      await ingestPostings(source.id, [samplePosting({ externalId: "ext-1" })], "TestCo");

      const result = await ingestPostings(source.id, [], "TestCo"); // posting no longer in this run's results

      expect(result.closed).toBe(0);
      const row = await prisma.posting.findFirst({ where: { sourceId: source.id, externalId: "ext-1" } });
      expect(row?.missedRuns).toBe(1);
      expect(row?.closedAt).toBeNull();
    });

    it("closes a posting after 2 consecutive misses", async () => {
      const source = await getOrCreateSource("test-source", "greenhouse", {});
      await ingestPostings(source.id, [samplePosting({ externalId: "ext-1" })], "TestCo");
      await ingestPostings(source.id, [], "TestCo");
      const result = await ingestPostings(source.id, [], "TestCo");

      expect(result.closed).toBe(1);
      const row = await prisma.posting.findFirst({ where: { sourceId: source.id, externalId: "ext-1" } });
      expect(row?.missedRuns).toBe(2);
      expect(row?.closedAt).toBeInstanceOf(Date);
    });

    it("reopens a closed posting that reappears in a fresh run", async () => {
      const source = await getOrCreateSource("test-source", "greenhouse", {});
      await ingestPostings(source.id, [samplePosting({ externalId: "ext-1" })], "TestCo");
      await ingestPostings(source.id, [], "TestCo");
      await ingestPostings(source.id, [], "TestCo"); // now closed

      const result = await ingestPostings(source.id, [samplePosting({ externalId: "ext-1" })], "TestCo");

      expect(result.reopened).toBe(1);
      const row = await prisma.posting.findFirst({ where: { sourceId: source.id, externalId: "ext-1" } });
      expect(row?.closedAt).toBeNull();
      expect(row?.missedRuns).toBe(0);
    });

    it("scopes the closing pass to (sourceId, organization) — one org's missing run doesn't close another org's postings under the same shared source", async () => {
      // Mirrors real usage: every org on a given adapter (e.g. every Greenhouse-hosted team)
      // shares one Source row. Closing pass must not cross organization boundaries.
      const source = await getOrCreateSource("shared-source", "greenhouse", {});
      await ingestPostings(source.id, [samplePosting({ externalId: "org-a-1", organization: "Org A" })], "Org A");
      await ingestPostings(source.id, [samplePosting({ externalId: "org-b-1", organization: "Org B" })], "Org B");

      // Org A's postings go missing for 2 runs; Org B is re-confirmed present both times.
      await ingestPostings(source.id, [], "Org A");
      await ingestPostings(
        source.id,
        [samplePosting({ externalId: "org-b-1", organization: "Org B" })],
        "Org B"
      );
      await ingestPostings(source.id, [], "Org A");
      await ingestPostings(
        source.id,
        [samplePosting({ externalId: "org-b-1", organization: "Org B" })],
        "Org B"
      );

      const orgARow = await prisma.posting.findFirst({ where: { sourceId: source.id, externalId: "org-a-1" } });
      const orgBRow = await prisma.posting.findFirst({ where: { sourceId: source.id, externalId: "org-b-1" } });
      expect(orgARow?.closedAt).toBeInstanceOf(Date);
      expect(orgBRow?.closedAt).toBeNull();
      expect(orgBRow?.missedRuns).toBe(0);
    });
  });
});
