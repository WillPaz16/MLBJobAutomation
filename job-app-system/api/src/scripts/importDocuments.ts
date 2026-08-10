import { readdirSync } from "fs";
import { join, extname, basename } from "path";
import { prisma } from "../db.js";

const PROFESSIONAL_ROOT = join(import.meta.dirname, "../../../..");
const RESUME_DIR = join(PROFESSIONAL_ROOT, "Resumes");
const COVER_LETTER_DIR = join(PROFESSIONAL_ROOT, "Cover Letters");

const SKIP_PREFIX = "~$"; // Word/Office lock files

function importDir(dir: string, kind: "resume" | "cover_letter") {
  let files: string[] = [];
  try {
    files = readdirSync(dir);
  } catch {
    console.warn(`Directory not found, skipping: ${dir}`);
    return [];
  }

  return files
    .filter((f) => !f.startsWith(SKIP_PREFIX) && !f.startsWith(".") && extname(f) === ".pdf")
    .map((f) => ({
      kind,
      label: basename(f, ".pdf"),
      filePath: join(dir, f),
      isBaseTemplate: /^will paz (resume|curriculum vitae)$/i.test(basename(f, ".pdf")),
    }));
}

async function main() {
  const documents = [...importDir(RESUME_DIR, "resume"), ...importDir(COVER_LETTER_DIR, "cover_letter")];

  let inserted = 0;
  for (const doc of documents) {
    const existing = await prisma.document.findFirst({ where: { filePath: doc.filePath } });
    if (existing) continue;
    await prisma.document.create({ data: doc });
    inserted++;
  }

  console.log(`Imported ${inserted} new document(s) of ${documents.length} found.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
