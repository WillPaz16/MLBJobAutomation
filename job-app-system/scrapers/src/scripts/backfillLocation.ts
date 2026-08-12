import { prisma } from "../db.js";
import { classifyWorkMode, classifyRegion } from "../location.js";

// One-off pass to apply location.ts's classifiers to postings that existed before the `workMode`/
// `region` columns were added (they default to null for all of them). New postings are always
// classified at ingest time (see ingest.ts) — this exists purely to backfill the pre-existing
// rows, modeled on backfillSeniority.ts / recategorize.ts. Safe to re-run any time
// classifyWorkMode/classifyRegion's logic changes — it only writes rows whose computed value(s)
// actually changed from what's stored.
async function main() {
  const postings = await prisma.posting.findMany({
    select: { id: true, location: true, description: true, workMode: true, region: true },
  });

  let changed = 0;
  const workModeCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();

  for (const posting of postings) {
    const newWorkMode = classifyWorkMode(posting.location, posting.description ?? undefined);
    const newRegion = classifyRegion(posting.location);

    workModeCounts.set(newWorkMode ?? "null", (workModeCounts.get(newWorkMode ?? "null") ?? 0) + 1);
    regionCounts.set(newRegion ?? "null", (regionCounts.get(newRegion ?? "null") ?? 0) + 1);

    if (newWorkMode === posting.workMode && newRegion === posting.region) continue;

    await prisma.posting.update({
      where: { id: posting.id },
      data: { workMode: newWorkMode, region: newRegion },
    });
    changed++;
  }

  console.log(`Backfilled workMode/region on ${changed} of ${postings.length} postings.`);
  console.log("workMode distribution:");
  for (const [bucket, count] of [...workModeCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bucket}: ${count}`);
  }
  console.log("region distribution:");
  for (const [bucket, count] of [...regionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bucket}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
