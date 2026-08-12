import { prisma } from "./db.js";
import type { NormalizedPosting } from "./types.js";
import { isLikelyDuplicateTitle } from "./dedupe.js";
import { classifySeniority } from "./seniority.js";
import { classifyWorkMode, classifyRegion } from "./location.js";

// Consecutive scrape runs of an org's source that must miss a posting before it's considered
// closed — not 1, so a single flaky/partial run can't wrongly close everything from that org.
const CLOSE_AFTER_MISSED_RUNS = 2;

export async function getOrCreateSource(name: string, type: string, config: Record<string, any>) {
  return prisma.source.upsert({
    where: { name },
    update: { config: JSON.stringify(config) },
    create: { name, type, config: JSON.stringify(config) },
  });
}

// `organization` is required (rather than derived from `postings`) so the closing pass still
// runs even when an org legitimately has zero current postings — an empty `postings` array alone
// can't tell us which org's source just ran, but the caller always knows.
export async function ingestPostings(sourceId: string, postings: NormalizedPosting[], organization: string) {
  let inserted = 0;
  let skipped = 0;
  let flaggedDuplicates = 0;
  let reopened = 0;
  const seenExternalIds: string[] = [];

  for (const posting of postings) {
    seenExternalIds.push(posting.externalId);

    const existing = await prisma.posting.findUnique({
      where: { sourceId_externalId: { sourceId, externalId: posting.externalId } },
    });
    if (existing) {
      if (existing.closedAt) reopened++;
      await prisma.posting.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          missedRuns: 0,
          closedAt: null,
          // Fill-only: never overwrite a description we already have with one we don't (a flaky
          // run returning empty can't erase good text). This is also what backfills description
          // for rows ingested before an adapter gained description support (see categorize()'s
          // description-argument comment in categorize.ts).
          ...(posting.description && !existing.description ? { description: posting.description } : {}),
          // Salary text won't change once posted and isn't protected data, so an unconditional
          // fill-only overwrite (rather than description's stricter never-overwrite) is simplest —
          // there's no flaky-run risk to guard against since a source either has it or doesn't.
          ...(posting.salary && !existing.salary ? { salary: posting.salary } : {}),
          // Unlike description, seniority is RE-COMPUTED on every re-scrape (not fill-only) — the
          // classifier can improve over time even though the title itself rarely changes.
          seniority: classifySeniority(posting.title, posting.description),
          // Same re-compute-every-scrape treatment as seniority above, for the same reason: the
          // classifiers in location.ts can improve over time even though location text rarely
          // changes for an already-seen posting.
          workMode: classifyWorkMode(posting.location ?? null, posting.description ?? null),
          region: classifyRegion(posting.location ?? null),
        },
      });
      skipped++;
      continue;
    }

    // Same job posted to a different source under a different external ID (e.g. an org listed on
    // both TeamWork Online and Dayforce) won't hit the check above — catch it by fuzzy title
    // match within the same organization instead. Flagged, not skipped: the match is inserted as
    // its own real row and linked via possibleDuplicateOfId so it stays visible and reviewable —
    // silently dropping it risked suppressing a genuinely different job that just shared wording.
    const sameOrgPostings = await prisma.posting.findMany({
      where: { organization: posting.organization },
      select: { id: true, title: true },
    });
    const duplicateMatch = sameOrgPostings.find((p) => isLikelyDuplicateTitle(p.title, posting.title));

    await prisma.posting.create({
      data: {
        sourceId,
        externalId: posting.externalId,
        title: posting.title,
        organization: posting.organization,
        location: posting.location,
        category: posting.category,
        seniority: classifySeniority(posting.title, posting.description),
        workMode: classifyWorkMode(posting.location ?? null, posting.description ?? null),
        region: classifyRegion(posting.location ?? null),
        url: posting.url,
        description: posting.description,
        salary: posting.salary,
        postedAt: posting.postedAt,
        lastSeenAt: new Date(),
        possibleDuplicateOfId: duplicateMatch?.id,
      },
    });
    inserted++;
    if (duplicateMatch) flaggedDuplicates++;
  }

  const closed = await closeMissingPostings(sourceId, organization, seenExternalIds);

  return { inserted, skipped, flaggedDuplicates, closed, reopened, total: postings.length };
}

// Scoped to (sourceId, organization) together, never sourceId alone — one Source row is shared
// across every org an adapter covers (e.g. all Greenhouse-hosted orgs share the "greenhouse"
// Source), so a naive sourceId-only comparison would wrongly close every OTHER org's postings
// under that adapter the moment any single org's run completed.
async function closeMissingPostings(sourceId: string, organization: string, seenExternalIds: string[]): Promise<number> {
  const missing = await prisma.posting.findMany({
    where: {
      sourceId,
      organization,
      closedAt: null,
      externalId: { notIn: seenExternalIds },
    },
  });

  let closed = 0;
  for (const posting of missing) {
    const missedRuns = posting.missedRuns + 1;
    const willClose = missedRuns >= CLOSE_AFTER_MISSED_RUNS;
    await prisma.posting.update({
      where: { id: posting.id },
      data: { missedRuns, closedAt: willClose ? new Date() : null },
    });
    if (willClose) closed++;
  }

  return closed;
}
