import { prisma } from "./db.js";
import type { NormalizedPosting } from "./types.js";

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
