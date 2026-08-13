import { prisma } from "./db.js";
import type { NormalizedPosting } from "./types.js";
import { isLikelyDuplicateTitle } from "./dedupe.js";
import { classifySeniority } from "./seniority.js";
import { classifyWorkMode, classifyRegion } from "./location.js";
import { isMlbOrg } from "./categorize.js";
import { classifyIsInternship } from "./internship.js";
import { classifyEducationRequirement } from "./education.js";

// GitHub-aggregator READMEs (e.g. SimplifyJobs' New-Grad-Positions) parse company names as free
// text and can produce multiple variants of the same real employer's name — confirmed live for
// Susquehanna International Group, which exists as 3 different `organization` strings in the DB:
// the canonical one from this session's own `sigCareers.ts` adapter, and two aggregator variants.
// Not exhaustive by nature — extend as more variants are found. Exported so the one-off backfill
// script (`scripts/normalizeOrganizationNames.ts`) can reuse the same map rather than duplicate it.
export const ORGANIZATION_ALIASES: Record<string, string> = {
  "Susquehanna International Group (SIG)": "Susquehanna International Group, LLP",
  "Susquehanna International Group": "Susquehanna International Group, LLP",
};

export function normalizeOrganization(organization: string): string {
  return ORGANIZATION_ALIASES[organization] ?? organization;
}

// Consecutive scrape runs of an org's source that must miss a posting before it's considered
// closed — not 1, so a single flaky/partial run can't wrongly close everything from that org.
const CLOSE_AFTER_MISSED_RUNS = 2;

// SQLite's bind-param limit is 999 on older builds, 32766 on newer ones — stay conservative.
// Above this many seen externalIds, `notIn: seenExternalIds` risks blowing the limit, so
// closeMissingPostings inverts the query instead (fetch all open rows, diff in JS).
export const NOT_IN_CHUNK = 900;

export async function getOrCreateSource(name: string, type: string) {
  return prisma.source.upsert({
    where: { name },
    update: {},
    create: { name, type },
  });
}

// `organization` is required (rather than derived from `postings`) so the closing pass still
// runs even when an org legitimately has zero current postings — an empty `postings` array alone
// can't tell us which org's source just ran, but the caller always knows.
export async function ingestPostings(sourceId: string, postings: NormalizedPosting[], organization: string) {
  // Normalize aliased organization names up front — before the dedup lookup, the fuzzy-match
  // check, and the actual DB write all use it — so every one of those steps agrees on the same
  // canonical string instead of drifting apart (a mismatch between the lookup step and the write
  // step would be a new bug, not a fix).
  organization = normalizeOrganization(organization);
  postings = postings.map((posting) => ({ ...posting, organization: normalizeOrganization(posting.organization) }));

  let inserted = 0;
  let skipped = 0;
  let flaggedDuplicates = 0;
  let reopened = 0;
  const seenExternalIds: string[] = [];

  // Hoisted out of the per-posting loop (was previously refetched for every NEW posting, an
  // N+1). Scoped to closedAt: null — a deliberate behavior change, a new posting no longer
  // fuzzy-matches against a long-closed one. Newly created rows in THIS batch are pushed onto
  // this same in-memory list below, so two near-identical titles in one batch still flag each
  // other against one another, which the old per-posting refetch got for free.
  const sameOrgPostings: { id: string; title: string }[] = await prisma.posting.findMany({
    where: { organization, closedAt: null },
    select: { id: true, title: true },
  });

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
          // Same re-compute-every-scrape treatment, for the same reason: isMlbOrg's hint list can
          // improve over time even though the org name itself never changes for an already-seen
          // posting.
          isMlbTeam: isMlbOrg(posting.organization),
          // Same re-compute-every-scrape treatment, for the same reason: classifyIsInternship's
          // regex can improve over time even though the title itself rarely changes for an
          // already-seen posting.
          isInternship: classifyIsInternship(posting.title),
          // Same re-compute-every-scrape treatment, for the same reason: classifyEducationRequirement's
          // regex buckets can improve over time even though title/description rarely change for an
          // already-seen posting.
          educationRequirement: classifyEducationRequirement(posting.title, posting.description),
          // Simple pass-through, like title/url — always overwrite from the latest adapter
          // output rather than fill-only/recompute, since it's just structural metadata about
          // which source section a row came from (not a derived classifier that can "improve").
          sourceSection: posting.sourceSection ?? null,
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
    const duplicateMatch = sameOrgPostings.find((p) => isLikelyDuplicateTitle(p.title, posting.title));

    const created = await prisma.posting.create({
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
        isMlbTeam: isMlbOrg(posting.organization),
        isInternship: classifyIsInternship(posting.title),
        educationRequirement: classifyEducationRequirement(posting.title, posting.description),
        sourceSection: posting.sourceSection ?? null,
        url: posting.url,
        description: posting.description,
        salary: posting.salary,
        postedAt: posting.postedAt,
        lastSeenAt: new Date(),
        possibleDuplicateOfId: duplicateMatch?.id,
      },
    });
    // Push onto the same in-memory list used for fuzzy-matching above, so a second near-
    // identical title later in THIS batch still gets flagged against it.
    sameOrgPostings.push({ id: created.id, title: created.title });
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
  let missing: { id: string; missedRuns: number }[];

  if (seenExternalIds.length <= NOT_IN_CHUNK) {
    missing = await prisma.posting.findMany({
      where: {
        sourceId,
        organization,
        closedAt: null,
        externalId: { notIn: seenExternalIds },
      },
      select: { id: true, missedRuns: true },
    });
  } else {
    // `externalId: { notIn: seenExternalIds }` binds one param per id — SQLite's limit is 999
    // on older builds, 32766 on newer ones. Above NOT_IN_CHUNK, invert the query instead: fetch
    // every open row for this (sourceId, organization) with no notIn filter, and diff the
    // "missing" set in JS against a Set of what this run actually saw.
    const seen = new Set(seenExternalIds);
    const openPostings = await prisma.posting.findMany({
      where: { sourceId, organization, closedAt: null },
      select: { id: true, missedRuns: true, externalId: true },
    });
    missing = openPostings.filter((p) => !seen.has(p.externalId));
  }

  const staying = missing.filter((p) => p.missedRuns + 1 < CLOSE_AFTER_MISSED_RUNS).map((p) => p.id);
  const closing = missing.filter((p) => p.missedRuns + 1 >= CLOSE_AFTER_MISSED_RUNS).map((p) => p.id);

  if (staying.length > 0) {
    await prisma.posting.updateMany({
      where: { id: { in: staying } },
      data: { missedRuns: { increment: 1 } },
    });
  }
  if (closing.length > 0) {
    await prisma.posting.updateMany({
      where: { id: { in: closing } },
      data: { missedRuns: { increment: 1 }, closedAt: new Date() },
    });
  }

  return closing.length;
}
