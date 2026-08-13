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
import { jobListRepoAdapter, type JobListRepoConfig } from "./adapters/jobListRepo.js";
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
  jobListRepoSources,
} from "./sources.config.js";
import { getOrCreateSource, ingestPostings } from "./ingest.js";
import { prisma } from "./db.js";
import type { Adapter } from "./types.js";

export async function runAdapter(adapter: Adapter, configs: Record<string, any>[]) {
  const source = await getOrCreateSource(adapter.sourceName, adapter.sourceType, {});
  let totalInserted = 0;

  for (const config of configs) {
    try {
      const postings = await adapter.fetchPostings(config);

      // Dynamic floor: an adapter returning far fewer postings than this org's current active
      // count is much more likely to be a scraper break (rotted selector, renamed API, timeout)
      // than a real 50%+ mass-closure of live jobs. Scoped to (source.id, organization) TOGETHER
      // — one Source row is shared across every org an adapter covers (e.g. all Greenhouse-hosted
      // teams share the "greenhouse" Source), so an unscoped count would compare one org's
      // returned postings against every org's combined active count and abort everything. Same
      // reasoning as ingest.ts's closeMissingPostings. priorActive === 0 leaves the guard inert
      // (the "this org always returns zero" case, e.g. the Twins page) so a genuinely-empty org
      // is never blocked from ingesting.
      //
      // Honest tradeoff (deliberate, documented in CLAUDE.md/the v9 plan): because this throws
      // BEFORE ingestPostings runs, missedRuns never increments for this org on a bad run, so an
      // org that genuinely drops to zero postings will NEVER auto-close via the normal 2-missed-
      // runs path. That's the accepted trade — fail toward "stays visible and shouts in the logs"
      // over "silently closes 30 live postings" — so the error message below must be loud and
      // specific (org name, prior count, new count), since it's the entire mitigation. No
      // auto-override, no suppression list.
      const priorActive = await prisma.posting.count({
        where: { sourceId: source.id, organization: config.organizationName, closedAt: null },
      });
      if (priorActive > 0 && postings.length < priorActive * 0.5) {
        throw new Error(
          `${adapter.sourceName}: ${config.organizationName} returned ${postings.length} posting(s), ` +
            `down from ${priorActive} active — refusing to run the closing pass. Needs a look.`
        );
      }

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

// jobListRepoAdapter is structurally different from every other adapter: one fetch yields
// postings spanning potentially 50+ different organizations, rather than one config entry = one
// org. ingestPostings requires a single `organization` string per call (for its closing-pass
// scoping), so its output must be grouped by organization first, then ingested once per group —
// never as one ungrouped call, which would break that scoping (see CLAUDE.md).
//
// Two DIFFERENT try/catch scopes here, deliberately:
//   - The OUTER one (fetch + parse + the dynamic-floor guard) intentionally aborts the WHOLE
//     repo on failure. The three guard layers in jobListRepo.ts exist specifically to prevent a
//     bad parse from ever reaching ingestPostings, so if any of them throw, nothing for this repo
//     should be ingested — that's the point of the guards, not a bug to route around.
//   - The INNER one (per-org, inside the loop) matches runAdapter's per-config-entry isolation:
//     one organization's ingestPostings call failing (e.g. a transient DB error) must not stop
//     ingestion for every other organization in the same repo's parsed output.
export async function runJobListRepoAdapter(cfg: JobListRepoConfig): Promise<number> {
  const source = await getOrCreateSource(cfg.key, jobListRepoAdapter.sourceType, cfg);
  let totalInserted = 0;

  let postings;
  try {
    postings = await jobListRepoAdapter.fetchPostings(cfg);

    // Guard layer 3: the dynamic floor against the DB, before any ingest for this repo at all.
    // Section-not-found and below-static-floor guards (layers 1 and 2) live inside fetchPostings
    // itself; this one needs the source id from getOrCreateSource, so it has to run here.
    const priorActive = await prisma.posting.count({ where: { sourceId: source.id, closedAt: null } });
    if (priorActive > 0 && postings.length < priorActive * 0.5) {
      throw new Error(
        `[${cfg.key}] parsed ${postings.length} posting(s), which is less than 50% of the ${priorActive} ` +
          `currently-active posting(s) for this source — aborting before any ingest to avoid a mass-close ` +
          `from what looks like row-format drift`
      );
    }
  } catch (err) {
    console.error(`[${cfg.key}] failed:`, (err as Error).message);
    return 0;
  }

  const byOrg = new Map<string, typeof postings>();
  for (const posting of postings) {
    const group = byOrg.get(posting.organization) ?? [];
    group.push(posting);
    byOrg.set(posting.organization, group);
  }

  for (const [organization, orgPostings] of byOrg) {
    try {
      const { inserted, skipped, closed, reopened, flaggedDuplicates } = await ingestPostings(
        source.id,
        orgPostings,
        organization
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
        `[${cfg.key}:${organization}] +${inserted} new, ${skipped} already known${extra ? `, ${extra}` : ""}`
      );
    } catch (err) {
      console.error(`[${cfg.key}:${organization}] failed:`, (err as Error).message);
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
    ...jobListRepoSources.map((cfg) => runJobListRepoAdapter(cfg)),
  ]);
  const inserted = results.reduce((a, b) => a + b, 0);
  console.log(`Discovery run complete. ${inserted} new posting(s) inserted.`);
  await prisma.$disconnect();
}

// Guarded so this module can be imported (e.g. to call runJobListRepoAdapter alone) without
// triggering the full 30-team discovery run as a side effect of import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
