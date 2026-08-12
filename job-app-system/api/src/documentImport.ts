import { readdirSync } from "fs";
import { join, extname, basename } from "path";
import { prisma } from "./db.js";

// Professional/ is three levels up from api/src (api/src -> api -> job-app-system -> Professional).
// Overridable via env var so tests never scan/write into the real Resumes/Cover Letters
// directories — see api/test/setup.ts, which points these at throwaway temp dirs.
const PROFESSIONAL_ROOT = join(import.meta.dirname, "../../..");
export const RESUME_DIR = process.env.DOCS_RESUME_DIR ?? join(PROFESSIONAL_ROOT, "Resumes");
export const COVER_LETTER_DIR = process.env.DOCS_COVER_LETTER_DIR ?? join(PROFESSIONAL_ROOT, "Cover Letters");

const SKIP_PREFIX = "~$"; // Word/Office lock files
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

interface CandidateDoc {
  kind: "resume" | "cover_letter";
  label: string;
  filePath: string;
  isBaseTemplate: boolean;
}

function scanDir(dir: string, kind: "resume" | "cover_letter"): CandidateDoc[] {
  let files: string[] = [];
  try {
    files = readdirSync(dir);
  } catch {
    console.warn(`Directory not found, skipping: ${dir}`);
    return [];
  }

  return files
    .filter(
      (f) =>
        !f.startsWith(SKIP_PREFIX) &&
        !f.startsWith(".") &&
        ALLOWED_EXTENSIONS.includes(extname(f).toLowerCase())
    )
    .map((f) => {
      const ext = extname(f);
      const label = basename(f, ext);
      return {
        kind,
        label,
        filePath: join(dir, f),
        isBaseTemplate: /^will paz (resume|curriculum vitae)$/i.test(label),
      };
    });
}

// Scans Resumes/ and Cover Letters/ for new .pdf/.docx files and inserts a plain (unmanaged —
// filePath-only, no storageKey) Document row for each one not already registered by filePath.
// When a .pdf and .docx share the same basename, the .pdf is registered as the primary/servable
// row (sourcePath records the sibling .docx path) rather than inserting two separate rows for the
// same logical document — a deliberate simplification, not a full pairing/versioning system.
export async function scanDocumentDirs(): Promise<{ inserted: CandidateDoc[]; skipped: number }> {
  const resumeCandidates = scanDir(RESUME_DIR, "resume");
  const coverCandidates = scanDir(COVER_LETTER_DIR, "cover_letter");
  const all = [...resumeCandidates, ...coverCandidates];

  // Pair .pdf + .docx sharing the same directory+label: keep the .pdf as primary, drop the .docx
  // (recorded via sourcePath) unless only the .docx exists.
  const byKey = new Map<string, CandidateDoc[]>();
  for (const doc of all) {
    const key = `${doc.kind}::${join(doc.filePath, "..")}::${doc.label}`;
    const list = byKey.get(key) ?? [];
    list.push(doc);
    byKey.set(key, list);
  }

  const toInsert: (CandidateDoc & { sourcePath?: string })[] = [];
  for (const list of byKey.values()) {
    const pdf = list.find((d) => extname(d.filePath).toLowerCase() === ".pdf");
    const docx = list.find((d) => extname(d.filePath).toLowerCase() === ".docx");
    if (pdf) {
      toInsert.push({ ...pdf, sourcePath: docx?.filePath });
    } else if (docx) {
      toInsert.push(docx);
    }
  }

  const inserted: CandidateDoc[] = [];
  let skipped = 0;
  for (const doc of toInsert) {
    const existing = await prisma.document.findFirst({ where: { filePath: doc.filePath } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.document.create({
      data: {
        kind: doc.kind,
        label: doc.label,
        filePath: doc.filePath,
        isBaseTemplate: doc.isBaseTemplate,
        sourcePath: (doc as { sourcePath?: string }).sourcePath,
      },
    });
    inserted.push(doc);
  }

  return { inserted, skipped };
}
