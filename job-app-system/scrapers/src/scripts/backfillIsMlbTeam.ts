import { prisma } from "../db.js";
import { isMlbOrg } from "../categorize.js";

// One-off pass to apply categorize.ts's isMlbOrg() to postings that existed before the
// `isMlbTeam` column was added (it defaults to false for all of them). New postings are always
// classified at ingest time (see ingest.ts) — this exists purely to backfill the pre-existing
// rows, modeled on backfillSeniority.ts. Safe to re-run any time isMlbOrg's logic changes — it
// only writes rows whose computed value actually changed from what's stored.
async function main() {
  const postings = await prisma.posting.findMany({
    select: { id: true, organization: true, isMlbTeam: true },
  });

  let changed = 0;
  const counts = new Map<string, number>();

  for (const posting of postings) {
    const newIsMlbTeam = isMlbOrg(posting.organization);
    const bucket = String(newIsMlbTeam);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    if (newIsMlbTeam === posting.isMlbTeam) continue;

    await prisma.posting.update({ where: { id: posting.id }, data: { isMlbTeam: newIsMlbTeam } });
    changed++;
  }

  console.log(`Backfilled isMlbTeam on ${changed} of ${postings.length} postings.`);
  for (const [bucket, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${bucket}: ${count}`);
  }

  const trueOrgs = await prisma.posting.findMany({
    where: { isMlbTeam: true },
    select: { organization: true },
    distinct: ["organization"],
    orderBy: { organization: "asc" },
  });
  console.log(`\nDistinct organizations classified isMlbTeam=true (${trueOrgs.length}):`);
  for (const { organization } of trueOrgs) {
    console.log(`  ${organization}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
