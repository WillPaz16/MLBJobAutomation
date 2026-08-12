import { prisma } from "../db.js";
import { canonicalUrl } from "../adapters/jobListRepo.js";
import { createHash } from "crypto";

// One-off pass, modeled on recategorize.ts's convention. jobListRepo.ts's externalId is now
// sha256(canonicalUrl(url)) instead of sha256(url) — needed because different job-list repos
// append different UTM/tracking params to the same underlying apply URL (Simplify:
// ?utm_source=Simplify&ref=Simplify; vansh: ?utm_source=vansh; speedyapply: none), so the same
// real job hashed to different externalIds across repos before this fix.
//
// Run this ONCE, before the first post-change discovery run, against the existing
// "simplify-new-grad" Source's rows — matching by the current `url` field (not by re-fetching),
// so it works even if the live README has since moved on. Skipping this would make every one of
// those ~107 rows look "new" on the next run and let the old (differently-hashed) rows close.
async function main() {
  const source = await prisma.source.findUnique({ where: { name: "simplify-new-grad" } });
  if (!source) {
    console.log('No "simplify-new-grad" Source row found — nothing to rehash.');
    await prisma.$disconnect();
    return;
  }

  const postings = await prisma.posting.findMany({
    where: { sourceId: source.id },
    select: { id: true, externalId: true, url: true },
  });

  let changed = 0;
  const samples: { id: string; before: string; after: string }[] = [];

  for (const posting of postings) {
    const newExternalId = createHash("sha256").update(canonicalUrl(posting.url)).digest("hex");
    if (newExternalId === posting.externalId) continue;

    await prisma.posting.update({ where: { id: posting.id }, data: { externalId: newExternalId } });
    changed++;
    if (samples.length < 5) samples.push({ id: posting.id, before: posting.externalId, after: newExternalId });
  }

  console.log(`Rehashed ${changed} of ${postings.length} "simplify-new-grad" posting(s).`);
  for (const s of samples) {
    console.log(`  ${s.id}: ${s.before} -> ${s.after}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
