import { prisma } from "../db.js";
import { ORGANIZATION_ALIASES } from "../ingest.js";

// One-off pass to collapse already-ingested rows whose `organization` matches a known alias
// (see ingest.ts's ORGANIZATION_ALIASES comment) into their canonical string. New postings are
// always normalized at ingest time now — this exists because rows ingested *before* the alias
// map existed stay on their old (non-canonical) organization string forever otherwise, same
// "no automatic retroactive recategorization" convention as scripts/recategorize.ts. Safe to
// re-run any time ORGANIZATION_ALIASES changes — it's read-only except for the `organization`
// column, and only updates rows whose value actually changes.
async function main() {
  let changed = 0;

  for (const [alias, canonical] of Object.entries(ORGANIZATION_ALIASES)) {
    const result = await prisma.posting.updateMany({
      where: { organization: alias },
      data: { organization: canonical },
    });
    if (result.count > 0) {
      console.log(`  "${alias}" -> "${canonical}": ${result.count} row(s)`);
    }
    changed += result.count;
  }

  console.log(`Normalized ${changed} posting(s) to canonical organization names.`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
