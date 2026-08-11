import { prisma } from "../db.js";
import { classifySeniority } from "../seniority.js";

// One-off pass to apply seniority.ts's classifier to postings that existed before the `seniority`
// column was added (it defaults to null for all of them). New postings are always classified at
// ingest time (see ingest.ts) — this exists purely to backfill the pre-existing rows, modeled on
// recategorize.ts. Safe to re-run any time classifySeniority's logic changes — it only writes rows
// whose computed value actually changed from what's stored.
async function main() {
  const postings = await prisma.posting.findMany({
    select: { id: true, title: true, description: true, seniority: true },
  });

  let changed = 0;
  const counts = new Map<string, number>();

  for (const posting of postings) {
    const newSeniority = classifySeniority(posting.title, posting.description ?? undefined);
    counts.set(newSeniority ?? "null", (counts.get(newSeniority ?? "null") ?? 0) + 1);
    if (newSeniority === posting.seniority) continue;

    await prisma.posting.update({ where: { id: posting.id }, data: { seniority: newSeniority } });
    changed++;
  }

  console.log(`Backfilled seniority on ${changed} of ${postings.length} postings.`);
  for (const [bucket, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bucket}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
