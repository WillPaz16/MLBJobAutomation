import { prisma } from "../db.js";
import { greenhouseAdapter } from "../adapters/greenhouse.js";
import { leverAdapter } from "../adapters/lever.js";
import { workdayAdapter } from "../adapters/workday.js";
import { bambooHrAdapter } from "../adapters/bamboohr.js";
import {
  greenhouseSources,
  leverSources,
  workdaySources,
  bambooHrSources,
} from "../sources.config.js";
import type { Adapter } from "../types.js";

// One-off pass to backfill Posting.description for rows ingested before their adapter gained
// description support (see CLAUDE.md's "categorize() takes an optional third description
// argument" note) or before ingest.ts started refreshing it on re-scrape. New postings already
// get a description at ingest time when their adapter provides one — this exists only to recover
// it for existing rows. Modeled on recategorize.ts: read-only except for the one `description`
// column, and only writes rows that are currently empty and whose adapter returned real text.
//
// Scoped to greenhouse/lever/workday/bamboohr — the sources actually missing description
// coverage. Not included, deliberately:
//   - ukg/teamworkonline/dayforce already had description support when their rows were ingested.
//   - adp genuinely has no description anywhere in its public API (verified live, see CLAUDE.md).
//   - team_page/aaimtrack are Playwright-driven and either already have description coverage
//     (Padres) or have had zero live postings to backfill against (Twins) — not worth the
//     Playwright cost here; a normal discovery run already covers them going forward.
//
// Usage:
//   npx tsx src/scripts/backfillDescriptions.ts                     # greenhouse + lever only
//   npx tsx src/scripts/backfillDescriptions.ts --source=workday    # workday only (slow: per-posting detail fetches)
//   npx tsx src/scripts/backfillDescriptions.ts --source=all        # everything, including the slow ones

type SourceKey = "greenhouse" | "lever" | "workday" | "bamboohr";

const ADAPTERS: Record<SourceKey, { adapter: Adapter; configs: Record<string, any>[]; slow?: boolean }> = {
  greenhouse: { adapter: greenhouseAdapter, configs: greenhouseSources },
  lever: { adapter: leverAdapter, configs: leverSources },
  workday: { adapter: workdayAdapter, configs: workdaySources, slow: true },
  bamboohr: { adapter: bambooHrAdapter, configs: bambooHrSources, slow: true },
};

const DEFAULT_KEYS: SourceKey[] = ["greenhouse", "lever"];

async function backfillSource(key: SourceKey): Promise<{ checked: number; filled: number }> {
  const { adapter, configs } = ADAPTERS[key];
  const source = await prisma.source.findUnique({ where: { name: adapter.sourceName } });
  if (!source) {
    console.log(`[${key}] no Source row yet — skipping (nothing ingested from it).`);
    return { checked: 0, filled: 0 };
  }

  let checked = 0;
  let filled = 0;

  for (const config of configs) {
    let postings;
    try {
      postings = await adapter.fetchPostings(config);
    } catch (err) {
      console.error(`[${key}:${config.organizationName}] fetch failed:`, (err as Error).message);
      continue;
    }

    for (const posting of postings) {
      checked++;
      if (!posting.description) continue;

      const existing = await prisma.posting.findUnique({
        where: { sourceId_externalId: { sourceId: source.id, externalId: posting.externalId } },
      });
      if (!existing || existing.description) continue;

      await prisma.posting.update({
        where: { id: existing.id },
        data: { description: posting.description },
      });
      filled++;
    }
  }

  console.log(`[${key}] checked ${checked} live postings, filled ${filled} descriptions.`);
  return { checked, filled };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--source="));
  const requested = arg?.slice("--source=".length);

  const keys: SourceKey[] =
    requested === "all"
      ? (Object.keys(ADAPTERS) as SourceKey[])
      : requested
        ? [requested as SourceKey]
        : DEFAULT_KEYS;

  for (const key of keys) {
    if (!ADAPTERS[key]) {
      console.error(`Unknown --source=${key}. Valid: ${Object.keys(ADAPTERS).join(", ")}, all`);
      process.exit(1);
    }
  }

  let totalFilled = 0;
  for (const key of keys) {
    const { filled } = await backfillSource(key);
    totalFilled += filled;
  }
  console.log(`Backfill complete. ${totalFilled} description(s) filled across ${keys.join(", ")}.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
