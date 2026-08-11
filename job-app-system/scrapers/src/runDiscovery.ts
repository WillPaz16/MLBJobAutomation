import { greenhouseAdapter } from "./adapters/greenhouse.js";
import { leverAdapter } from "./adapters/lever.js";
import { workdayAdapter } from "./adapters/workday.js";
import { adpAdapter } from "./adapters/adp.js";
import { ukgAdapter } from "./adapters/ukg.js";
import { bambooHrAdapter } from "./adapters/bamboohr.js";
import { aaimtrackAdapter } from "./adapters/aaimtrack.js";
import { teamworkOnlineAdapter } from "./adapters/teamworkonline.js";
import { dayforceAdapter } from "./adapters/dayforce.js";
import { teamPageAdapter } from "./adapters/teamPage.js";
import {
  greenhouseSources,
  leverSources,
  workdaySources,
  adpSources,
  ukgSources,
  bambooHrSources,
  aaimtrackSources,
  teamworkOnlineSources,
  dayforceSources,
  teamPageSources,
} from "./sources.config.js";
import { getOrCreateSource, ingestPostings } from "./ingest.js";
import { prisma } from "./db.js";
import type { Adapter } from "./types.js";

async function runAdapter(adapter: Adapter, configs: Record<string, any>[]) {
  const source = await getOrCreateSource(adapter.sourceName, adapter.sourceType, {});
  let totalInserted = 0;

  for (const config of configs) {
    try {
      const postings = await adapter.fetchPostings(config);
      const { inserted, skipped, closed, reopened, flaggedDuplicates } = await ingestPostings(
        source.id,
        postings,
        config.organizationName
      );
      totalInserted += inserted;
      const extra = [
        closed > 0 ? `${closed} closed` : null,
        reopened > 0 ? `${reopened} reopened` : null,
        flaggedDuplicates > 0 ? `${flaggedDuplicates} flagged as possible duplicates` : null,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(
        `[${adapter.sourceName}:${config.organizationName}] +${inserted} new, ${skipped} already known${extra ? `, ${extra}` : ""}`
      );
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
    runAdapter(adpAdapter, adpSources),
    runAdapter(ukgAdapter, ukgSources),
    runAdapter(bambooHrAdapter, bambooHrSources),
    runAdapter(aaimtrackAdapter, aaimtrackSources),
    runAdapter(teamworkOnlineAdapter, teamworkOnlineSources),
    runAdapter(dayforceAdapter, dayforceSources),
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
