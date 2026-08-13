import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { getOrCreateSource } from "../src/ingest.js";
import { runAdapter } from "../src/runDiscovery.js";
import type { Adapter, NormalizedPosting } from "../src/types.js";

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

async function seedActivePostings(
  sourceId: string,
  organization: string,
  count: number
): Promise<void> {
  for (let i = 0; i < count; i++) {
    await prisma.posting.create({
      data: {
        sourceId,
        externalId: `${organization}-${i}`,
        title: `Role ${i}`,
        organization,
        category: "OTHER",
        url: `https://example.com/${organization}/${i}`,
        lastSeenAt: new Date(),
      },
    });
  }
}

function stubAdapter(fetchPostings: Adapter["fetchPostings"]): Adapter {
  return {
    sourceName: "stub-source",
    sourceType: "stub",
    fetchPostings,
  };
}

describe("runAdapter dynamic-floor guard", () => {
  it("refuses to run the closing pass when postings drop below 50% of prior active — twice in a row, no missedRuns bump, nothing closes", async () => {
    const source = await getOrCreateSource("stub-source", "stub");
    await seedActivePostings(source.id, "TestCo", 4);

    const adapter = stubAdapter(async () => []);

    await runAdapter(adapter, [{ organizationName: "TestCo" }]);
    let rows = await prisma.posting.findMany({ where: { sourceId: source.id, organization: "TestCo" } });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.missedRuns === 0)).toBe(true);
    expect(rows.every((r) => r.closedAt === null)).toBe(true);

    // Run a second time — if the guard didn't fire, two consecutive misses would close everything.
    await runAdapter(adapter, [{ organizationName: "TestCo" }]);
    rows = await prisma.posting.findMany({ where: { sourceId: source.id, organization: "TestCo" } });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.missedRuns === 0)).toBe(true);
    expect(rows.every((r) => r.closedAt === null)).toBe(true);
  });

  it("does not fire when priorActive is 0 — a genuinely-always-empty org ingests normally", async () => {
    const source = await getOrCreateSource("stub-source", "stub");
    const adapter = stubAdapter(async () => []);

    // No seeded postings for this org at all.
    await expect(runAdapter(adapter, [{ organizationName: "AlwaysEmptyCo" }])).resolves.not.toThrow();

    const rows = await prisma.posting.findMany({ where: { sourceId: source.id, organization: "AlwaysEmptyCo" } });
    expect(rows).toHaveLength(0);
  });

  it("scopes the guard to (source, organization) — one org's healthy return isn't blocked by another org's crash on the same shared Source", async () => {
    const source = await getOrCreateSource("stub-source", "stub");
    await seedActivePostings(source.id, "OrgA", 10);
    await seedActivePostings(source.id, "OrgB", 4);

    const orgAPosting = samplePosting({ externalId: "orga-new-1", organization: "OrgA" });

    const adapter = stubAdapter(async (config: Record<string, any>) => {
      if (config.organizationName === "OrgA") {
        // Healthy: returns all 10 prior + doesn't matter exactly, just needs to stay >= 50%.
        return Array.from({ length: 10 }, (_, i) =>
          samplePosting({ externalId: `orga-new-${i}`, organization: "OrgA" })
        );
      }
      // OrgB "crashes" and returns nothing.
      return [];
    });

    await runAdapter(adapter, [{ organizationName: "OrgA" }, { organizationName: "OrgB" }]);

    // OrgA ingested normally: its new postings exist, none of OrgB's guard logic touched it.
    const orgARows = await prisma.posting.findMany({ where: { sourceId: source.id, organization: "OrgA" } });
    expect(orgARows.some((r) => r.externalId === "orga-new-0")).toBe(true);

    // OrgB's original 4 postings are protected by the guard: untouched, not closed, no missedRuns bump.
    const orgBRows = await prisma.posting.findMany({ where: { sourceId: source.id, organization: "OrgB" } });
    expect(orgBRows).toHaveLength(4);
    expect(orgBRows.every((r) => r.missedRuns === 0)).toBe(true);
    expect(orgBRows.every((r) => r.closedAt === null)).toBe(true);
  });
});
