import { greenhouseAdapter } from "./adapters/greenhouse.js";
import { leverAdapter } from "./adapters/lever.js";
import { workdayAdapter } from "./adapters/workday.js";
import { teamPageAdapter } from "./adapters/teamPage.js";
import { greenhouseSources, leverSources, workdaySources, teamPageSources } from "./sources.config.js";
import { getOrCreateSource, ingestPostings } from "./ingest.js";
import { prisma } from "./db.js";
import type { Adapter } from "./types.js";

async function runAdapter(adapter: Adapter, configs: Record<string, any>[]) {
  const source = await getOrCreateSource(adapter.sourceName, adapter.sourceType, {});
  let totalInserted = 0;

  for (const config of configs) {
    try {
      const postings = await adapter.fetchPostings(config);
      const { inserted, skipped } = await ingestPostings(source.id, postings);
      totalInserted += inserted;
      console.log(`[${adapter.sourceName}:${config.organizationName}] +${inserted} new, ${skipped} already known`);
    } catch (err) {
      console.error(`[${adapter.sourceName}:${config.organizationName}] failed:`, (err as Error).message);
    }
  }

  return totalInserted;
}

async function main() {
  const results = await Promise.all([
    runAdapter(greenhouseAdapter, greenhouseSources),
    runAdapter(leverAdapter, leverSources),
    runAdapter(workdayAdapter, workdaySources),
    runAdapter(teamPageAdapter, teamPageSources),
  ]);
  const inserted = results.reduce((a, b) => a + b, 0);
  console.log(`Discovery run complete. ${inserted} new posting(s) inserted.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
