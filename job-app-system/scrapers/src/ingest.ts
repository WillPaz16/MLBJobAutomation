import { prisma } from "./db.js";
import type { NormalizedPosting } from "./types.js";
import { isLikelyDuplicateTitle } from "./dedupe.js";

export async function getOrCreateSource(name: string, type: string, config: Record<string, any>) {
  return prisma.source.upsert({
    where: { name },
    update: { config: JSON.stringify(config) },
    create: { name, type, config: JSON.stringify(config) },
  });
}

export async function ingestPostings(sourceId: string, postings: NormalizedPosting[]) {
  let inserted = 0;
  let skipped = 0;

  for (const posting of postings) {
    const existing = await prisma.posting.findUnique({
      where: { sourceId_externalId: { sourceId, externalId: posting.externalId } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Same job posted to a different source under a different external ID (e.g. an org listed on
    // both TeamWork Online and Dayforce) won't hit the check above — catch it by fuzzy title
    // match within the same organization instead.
    const sameOrgPostings = await prisma.posting.findMany({
      where: { organization: posting.organization },
      select: { title: true },
    });
    if (sameOrgPostings.some((p) => isLikelyDuplicateTitle(p.title, posting.title))) {
      skipped++;
      continue;
    }

    await prisma.posting.create({
      data: {
        sourceId,
        externalId: posting.externalId,
        title: posting.title,
        organization: posting.organization,
        location: posting.location,
        category: posting.category,
        url: posting.url,
        description: posting.description,
        postedAt: posting.postedAt,
      },
    });
    inserted++;
  }

  return { inserted, skipped, total: postings.length };
}
