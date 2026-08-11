import { prisma } from "../db.js";
import { categorize } from "../categorize.js";

// One-off pass to apply categorize.ts's current logic to postings already in the database.
// New postings always get categorized at ingest time — this exists because the BASEBALL_OPS
// over-broad-default bug (fixed in the automation pass) mislabeled a real chunk of the existing
// 1,200+ postings before the fix landed, and those rows are never retroactively recategorized on
// their own. Safe to re-run any time categorize.ts's logic changes — it's read-only except for
// the one `category` column, and only writes rows whose category actually changed.
async function main() {
  const postings = await prisma.posting.findMany({
    select: { id: true, title: true, organization: true, description: true, category: true },
  });

  let changed = 0;
  const changesByDirection = new Map<string, number>();

  for (const posting of postings) {
    const newCategory = categorize(posting.title, posting.organization, posting.description ?? undefined);
    if (newCategory === posting.category) continue;

    await prisma.posting.update({ where: { id: posting.id }, data: { category: newCategory } });
    changed++;
    const key = `${posting.category} -> ${newCategory}`;
    changesByDirection.set(key, (changesByDirection.get(key) ?? 0) + 1);
  }

  console.log(`Recategorized ${changed} of ${postings.length} postings.`);
  for (const [direction, count] of [...changesByDirection.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${direction}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
