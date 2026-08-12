import { prisma } from "../db.js";
import { classifyIsInternship } from "../internship.js";

// One-off pass to apply internship.ts's classifyIsInternship() to postings that existed before
// the `isInternship` column was added (it defaults to false for all of them). New postings are
// always classified at ingest time (see ingest.ts) — this exists purely to backfill the
// pre-existing rows, modeled on backfillIsMlbTeam.ts. Safe to re-run any time
// classifyIsInternship's logic changes — it only writes rows whose computed value actually
// changed from what's stored.
async function main() {
  const postings = await prisma.posting.findMany({
    select: { id: true, title: true, isInternship: true },
  });

  let changed = 0;
  const counts = new Map<string, number>();
  const examples = new Map<string, string[]>();

  for (const posting of postings) {
    const newIsInternship = classifyIsInternship(posting.title);
    const bucket = String(newIsInternship);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    const bucketExamples = examples.get(bucket) ?? [];
    if (bucketExamples.length < 5 && !bucketExamples.includes(posting.title)) {
      bucketExamples.push(posting.title);
    }
    examples.set(bucket, bucketExamples);

    if (newIsInternship === posting.isInternship) continue;

    await prisma.posting.update({ where: { id: posting.id }, data: { isInternship: newIsInternship } });
    changed++;
  }

  console.log(`Backfilled isInternship on ${changed} of ${postings.length} postings.`);
  for (const [bucket, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bucket}: ${count}`);
    console.log(`    examples: ${(examples.get(bucket) ?? []).join(" | ")}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
