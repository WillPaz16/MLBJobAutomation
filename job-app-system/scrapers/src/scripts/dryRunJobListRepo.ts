import { jobListRepoAdapter } from "../adapters/jobListRepo.js";
import { jobListRepoSources } from "../sources.config.js";

// Dry-run tooling: fetches and parses a job-list-repo config WITHOUT touching the DB at all — no
// getOrCreateSource, no ingestPostings. Use this to determine minExpectedPostings for a new repo
// (roughly half the observed post-filter count) and to sanity-check a config before wiring it
// into sources.config.ts, per the add-job-source skill's "Adding a GitHub job-list repo" section.
//
// Usage: npx tsx src/scripts/dryRunJobListRepo.ts [key]
// With no key, dry-runs every configured job-list-repo source.

async function dryRunOne(cfg: (typeof jobListRepoSources)[number]) {
  console.log(`\n=== ${cfg.key} ===`);
  try {
    const postings = await jobListRepoAdapter.fetchPostings(cfg);
    console.log(`Total rows: ${postings.length}`);

    const bySection = new Map<string, number>();
    for (const p of postings) {
      const key = p.sourceSection ?? "(none)";
      bySection.set(key, (bySection.get(key) ?? 0) + 1);
    }
    console.log("By section:");
    for (const [section, count] of bySection) console.log(`  ${section}: ${count}`);

    console.log("First 10 rows:");
    for (const p of postings.slice(0, 10)) {
      console.log(`  ${p.organization} — ${p.title} (${p.location ?? "no location"})`);
    }
  } catch (err) {
    console.error(`  FAILED: ${(err as Error).message}`);
  }
}

async function main() {
  const key = process.argv[2];
  const targets = key ? jobListRepoSources.filter((c) => c.key === key) : jobListRepoSources;

  if (key && targets.length === 0) {
    console.error(`No configured job-list-repo source with key "${key}".`);
    process.exit(1);
  }

  for (const cfg of targets) {
    await dryRunOne(cfg);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
