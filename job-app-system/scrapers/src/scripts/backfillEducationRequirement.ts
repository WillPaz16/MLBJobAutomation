import { prisma } from "../db.js";
import { classifyEducationRequirement } from "../education.js";

// One-off pass to apply education.ts's classifier to postings that existed before the
// `educationRequirement` column was added (it defaults to null for all of them). New postings are
// always classified at ingest time (see ingest.ts) — this exists purely to backfill the
// pre-existing rows, modeled on backfillSeniority.ts. Safe to re-run any time
// classifyEducationRequirement's logic changes — it only writes rows whose computed value
// actually changed from what's stored.
async function main() {
  const postings = await prisma.posting.findMany({
    select: { id: true, title: true, description: true, educationRequirement: true },
  });

  let changed = 0;
  const counts = new Map<string, number>();

  for (const posting of postings) {
    const newEducationRequirement = classifyEducationRequirement(posting.title, posting.description ?? undefined);
    counts.set(newEducationRequirement ?? "null", (counts.get(newEducationRequirement ?? "null") ?? 0) + 1);
    if (newEducationRequirement === posting.educationRequirement) continue;

    await prisma.posting.update({ where: { id: posting.id }, data: { educationRequirement: newEducationRequirement } });
    changed++;
  }

  console.log(`Backfilled educationRequirement on ${changed} of ${postings.length} postings.`);
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
