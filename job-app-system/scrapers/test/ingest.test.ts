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
    const result = await ingestPostings(source.id, [samplePosting()]);
    expect(result).toEqual({ inserted: 1, skipped: 0, total: 1 });

    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows).toHaveLength(1);
  });

  it("dedupes on a second run with the same externalId — no duplicate rows", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    await ingestPostings(source.id, [samplePosting()]);
    const second = await ingestPostings(source.id, [samplePosting()]);

    expect(second).toEqual({ inserted: 0, skipped: 1, total: 1 });
    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows).toHaveLength(1);
  });

  it("treats the same externalId under a different source as distinct", async () => {
    const sourceA = await getOrCreateSource("source-a", "greenhouse", {});
    const sourceB = await getOrCreateSource("source-b", "lever", {});
    await ingestPostings(sourceA.id, [samplePosting()]);
    const result = await ingestPostings(sourceB.id, [samplePosting()]);

    expect(result).toEqual({ inserted: 1, skipped: 0, total: 1 });
  });

  it("inserts new postings and skips known ones within the same mixed batch", async () => {
    const source = await getOrCreateSource("test-source", "greenhouse", {});
    await ingestPostings(source.id, [samplePosting({ externalId: "ext-1" })]);

    const result = await ingestPostings(source.id, [
      samplePosting({ externalId: "ext-1" }),
      samplePosting({ externalId: "ext-2" }),
    ]);

    expect(result).toEqual({ inserted: 1, skipped: 1, total: 2 });
  });
});
