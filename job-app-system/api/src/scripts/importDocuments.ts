import { prisma } from "../db.js";
import { scanDocumentDirs } from "../documentImport.js";

async function main() {
  const { inserted, skipped } = await scanDocumentDirs();
  console.log(`Imported ${inserted.length} new document(s), skipped ${skipped} already-registered.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
