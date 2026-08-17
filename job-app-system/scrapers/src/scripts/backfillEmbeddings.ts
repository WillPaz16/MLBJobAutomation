import { prisma } from "../db.js";
import { embedText } from "../embeddings.js";

// One-off pass to compute embeddings for postings that existed before the `embedding` column was
// added, or that failed to embed at ingest time (e.g. Ollama was down). Only writes postings
// currently missing an embedding, so it's safe/cheap to re-run — modeled on
// backfillEducationRequirement.ts, but fill-only (embeddings are a real network call per posting,
// unlike the free regex classifiers) rather than recompute-every-run.
async function main() {
  const postings = await prisma.posting.findMany({
    where: { embedding: null },
    select: { id: true, title: true, description: true },
  });

  let embedded = 0;
  let failed = 0;

  for (const posting of postings) {
    try {
      const vector = await embedText(`${posting.title} ${posting.description ?? ""}`);
      await prisma.posting.update({ where: { id: posting.id }, data: { embedding: JSON.stringify(vector) } });
      embedded++;
    } catch (err) {
      failed++;
      console.error(`Failed to embed posting "${posting.title}" (${posting.id}):`, err);
    }
  }

  console.log(`Backfilled embedding on ${embedded} of ${postings.length} postings missing one (${failed} failed).`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
