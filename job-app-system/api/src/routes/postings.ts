import { Router } from "express";
import { createHash } from "crypto";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { createManualPostingSchema, paginationSchema, updatePostingSchema } from "../validation.js";
import { computeFitScore } from "../fitScore.js";

export const postingsRouter = Router();

// posting rows carry more fields than FitScorePosting needs — this keeps computeFitScore's
// signature narrow/pure while still accepting the richer Prisma result shape.
function withFitScore<T extends { title: string; organization: string; category: string; location: string | null; description: string | null }>(
  posting: T,
  profile: {
    skills: string;
    coreSkills: string | null;
    preferredCategories: string | null;
    locationKeywords: string | null;
    excludeKeywords: string | null;
  } | null
): T & { fitScore?: number; fitTier?: string; matchedSkills?: string[]; reasons?: unknown[]; evidence?: unknown[] } {
  if (!profile) return posting;
  const { score, tier, matchedSkills, reasons, evidence } = computeFitScore(posting, profile);
  return { ...posting, fitScore: score, fitTier: tier, matchedSkills, reasons, evidence };
}

const SORT_OPTIONS = {
  discoveredAt_desc: { discoveredAt: "desc" as const },
  discoveredAt_asc: { discoveredAt: "asc" as const },
  postedAt_desc: { postedAt: "desc" as const },
  postedAt_asc: { postedAt: "asc" as const },
};

postingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const {
      category,
      seniority,
      workMode,
      region,
      location,
      remoteOnly,
      q,
      source,
      organization,
      status,
      sort,
      minFit,
      hideDuplicates,
      showDismissed,
      isMlbTeam,
      sourceSection,
    } = req.query;
    const { take, skip } = paginationSchema.parse(req.query);

    const statusFilter =
      status === "closed" ? { closedAt: { not: null } } : status === "all" ? {} : { closedAt: null };

    // `minFit` requires the same full-fetch-then-JS-filter treatment as fit_desc sorting (fit
    // score isn't a DB column), but the two are independent/orthogonal: a caller can filter by
    // minFit while sorting by postedAt, or sort by fit_desc with no minFit floor at all.
    const parsedMinFit = typeof minFit === "string" ? Number(minFit) : undefined;
    const hasMinFit = parsedMinFit !== undefined && !Number.isNaN(parsedMinFit);

    const where = {
      category: category ? (category as string) : undefined,
      seniority: seniority ? (seniority as string) : undefined,
      // Exact-match filters on the classifiers in scrapers/src/location.ts, same pattern as
      // `seniority` above. `workMode: "REMOTE"` and the older `remoteOnly` boolean filter below
      // are two independent ways to ask for the same thing — they're kept consistent because
      // classifyWorkMode's REMOTE branch uses the identical `/\bremote\b/i` test that
      // `remoteOnly`'s `location.contains("remote")` performs (and Prisma's SQLite `contains` is
      // case-insensitive by default, confirmed live against real data), so a stored `workMode`
      // can never disagree with what the live substring check would compute.
      workMode: workMode ? (workMode as string) : undefined,
      region: region ? (region as string) : undefined,
      // Matches the existing free-text `location` contains-filter's case sensitivity exactly
      // (Prisma's default `contains` on SQLite is case-sensitive) — remoteOnly is just another
      // `location`-shaped condition, combined via AND below rather than a duplicate object key.
      source: source ? { type: source as string } : undefined,
      organization: organization ? (organization as string) : undefined,
      // Exact-match boolean filter, same "true"/"false" string-coercion pattern as
      // hideDuplicates/showDismissed above — Express query params always arrive as strings.
      isMlbTeam: isMlbTeam === "true" ? true : isMlbTeam === "false" ? false : undefined,
      // Exact-match filter, same pattern as `organization` above — sourceSection is free-text
      // (the exact SimplifyJobs section header), not an enum, so no zod schema entry is needed.
      sourceSection: sourceSection ? (sourceSection as string) : undefined,
      dismissedAt: showDismissed === "true" ? undefined : null,
      ...statusFilter,
      AND: [
        q ? { OR: [{ title: { contains: q as string } }, { organization: { contains: q as string } }] } : {},
        hideDuplicates === "true" ? { OR: [{ possibleDuplicateOfId: null }, { duplicateRejected: true }] } : {},
        location ? { location: { contains: location as string } } : {},
        remoteOnly === "true" ? { location: { contains: "remote" } } : {},
      ],
    };

    const profile = await prisma.candidateProfile.findUnique({ where: { id: "profile" } });

    if (sort === "fit_desc" || hasMinFit) {
      // Fit score isn't a DB column, so it can't go through Prisma's orderBy/where — fetch every
      // matching row (no take/skip here), score in JS, optionally filter by minFit, sort
      // according to whatever `sort` was actually requested (defaulting to discoveredAt_desc,
      // same as the non-scored path — minFit doesn't force fit_desc sorting), then slice the
      // page ourselves. X-Total-Count reflects the post-minFit-filter count, not the unfiltered
      // total, since that's the count that actually matches the request.
      const allPostings = await prisma.posting.findMany({
        where,
        include: { source: true, applications: true, possibleDuplicateOf: true },
      });
      let scored = allPostings.map((p) => withFitScore(p, profile));
      if (hasMinFit) {
        scored = scored.filter((p) => (p.fitScore ?? 0) >= parsedMinFit!);
      }
      if (sort === "fit_desc") {
        scored.sort(
          (a, b) =>
            (b.fitScore ?? 0) - (a.fitScore ?? 0) ||
            +new Date(b.discoveredAt) - +new Date(a.discoveredAt) ||
            a.id.localeCompare(b.id)
        );
      } else {
        const sortOrder =
          typeof sort === "string" && sort in SORT_OPTIONS ? SORT_OPTIONS[sort as keyof typeof SORT_OPTIONS] : SORT_OPTIONS.discoveredAt_desc;
        const [field, direction] = Object.entries(sortOrder)[0] as [string, "asc" | "desc"];
        scored.sort((a, b) => {
          const av = (a as any)[field];
          const bv = (b as any)[field];
          const cmp = av === bv ? 0 : av === null ? 1 : bv === null ? -1 : +new Date(av) - +new Date(bv);
          return direction === "asc" ? cmp : -cmp;
        });
      }
      const total = scored.length;
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      const paged = scored.slice(start, end);
      res.set("X-Total-Count", String(total));
      res.json(paged);
      return;
    }

    const [postings, total] = await Promise.all([
      prisma.posting.findMany({
        where,
        include: { source: true, applications: true, possibleDuplicateOf: true },
        orderBy:
          typeof sort === "string" && sort in SORT_OPTIONS
            ? SORT_OPTIONS[sort as keyof typeof SORT_OPTIONS]
            : SORT_OPTIONS.discoveredAt_desc,
        take,
        skip,
      }),
      prisma.posting.count({ where }),
    ]);
    // Exposed via a header, not the body, so the response stays a bare array — every existing
    // consumer/test asserting on res.body directly keeps working unchanged.
    res.set("X-Total-Count", String(total));
    res.json(postings.map((p) => withFitScore(p, profile)));
  })
);

// Registered before "/:id" — Express matches path segments in declaration order, and "/:id" would
// otherwise swallow "/organizations" as a literal id value.
postingsRouter.get(
  "/organizations",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.posting.findMany({
      where: { dismissedAt: null },
      select: { organization: true },
      distinct: ["organization"],
      orderBy: { organization: "asc" },
    });
    res.json(rows.map((r) => r.organization));
  })
);

// Registered before "/:id" for the same reason as "/organizations" above.
postingsRouter.get(
  "/facets",
  asyncHandler(async (_req, res) => {
    const [seniorityRows, workModeRows, regionRows, mlbTeamTrueCount, mlbTeamFalseCount, sourceSectionRows] = await Promise.all([
      prisma.posting.findMany({
        where: { seniority: { not: null } },
        select: { seniority: true },
        distinct: ["seniority"],
        orderBy: { seniority: "asc" },
      }),
      prisma.posting.findMany({
        where: { workMode: { not: null } },
        select: { workMode: true },
        distinct: ["workMode"],
        orderBy: { workMode: "asc" },
      }),
      prisma.posting.findMany({
        where: { region: { not: null } },
        select: { region: true },
        distinct: ["region"],
        orderBy: { region: "asc" },
      }),
      // Unlike the distinct-value lists above, these two are rendered directly as user-facing
      // tab-count numbers (Discovery's Baseball/DS-AI-ML/Quant/PM tabs) — an unscoped count would
      // visibly disagree with what the default view actually shows (confirmed live: isMlbTeam=true
      // totalled 204 unscoped vs. 186 once closed/dismissed rows are excluded, a discrepancy a user
      // would immediately notice comparing the tab label to the tab's own contents). Scoped to
      // match the default view exactly: active (closedAt: null) and not dismissed
      // (dismissedAt: null) — the same status="active"/showDismissed="false" defaults the main
      // GET / handler uses.
      prisma.posting.count({ where: { isMlbTeam: true, closedAt: null, dismissedAt: null } }),
      prisma.posting.count({ where: { isMlbTeam: false, closedAt: null, dismissedAt: null } }),
      prisma.posting.groupBy({
        by: ["sourceSection"],
        where: { sourceSection: { not: null }, closedAt: null, dismissedAt: null },
        _count: { sourceSection: true },
      }),
    ]);
    const sourceSectionCounts: Record<string, number> = {};
    for (const row of sourceSectionRows) {
      if (row.sourceSection) sourceSectionCounts[row.sourceSection] = row._count.sourceSection;
    }
    res.json({
      seniorities: seniorityRows.map((r) => r.seniority),
      workModes: workModeRows.map((r) => r.workMode),
      regions: regionRows.map((r) => r.region),
      mlbTeamCounts: { true: mlbTeamTrueCount, false: mlbTeamFalseCount },
      sourceSectionCounts,
    });
  })
);

postingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [posting, profile] = await Promise.all([
      prisma.posting.findUnique({
        where: { id: req.params.id },
        include: { source: true, applications: true, possibleDuplicateOf: true },
      }),
      prisma.candidateProfile.findUnique({ where: { id: "profile" } }),
    ]);
    if (!posting) throw new HttpError(404, "Posting not found");
    res.json(withFitScore(posting, profile));
  })
);

postingsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { dismissedAt, ...rest } = updatePostingSchema.parse(req.body);
    const posting = await prisma.posting
      .update({
        where: { id: req.params.id },
        data: {
          ...rest,
          dismissedAt: dismissedAt === undefined ? undefined : dismissedAt ? new Date(dismissedAt) : null,
        },
      })
      .catch(() => {
        throw new HttpError(404, "Posting not found");
      });
    res.json(posting);
  })
);

postingsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.posting.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Posting not found");
    });
    res.status(204).end();
  })
);

postingsRouter.post(
  "/manual",
  asyncHandler(async (req, res) => {
    const data = createManualPostingSchema.parse(req.body);
    // One Source per organization for manually-added postings, so they're grouped/attributed
    // like scraped ones instead of all collapsing into a single generic "manual" bucket.
    const sourceName = `manual:${data.organization}`;
    const source = await prisma.source.upsert({
      where: { name: sourceName },
      update: {},
      create: { name: sourceName, type: "manual" },
    });
    // Synthetic externalId from the URL so pasting the same posting twice still dedupes
    // via the existing sourceId+externalId unique constraint — no separate manual-dedup logic.
    const externalId = createHash("sha256").update(data.url).digest("hex");

    // Idempotent: pasting the same URL again just returns the existing posting rather
    // than erroring, matching the scraper's silent-skip dedup behavior in ingest.ts.
    const posting = await prisma.posting.upsert({
      where: { sourceId_externalId: { sourceId: source.id, externalId } },
      update: {},
      create: {
        sourceId: source.id,
        externalId,
        title: data.title,
        organization: data.organization,
        location: data.location,
        category: data.category ?? "OTHER",
        url: data.url,
        description: data.description,
      },
    });
    res.status(201).json(posting);
  })
);

postingsRouter.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const posting = await prisma.posting.findUnique({ where: { id: req.params.id } });
    if (!posting) throw new HttpError(404, "Posting not found");
    const application = await prisma.application.create({
      data: { postingId: posting.id, stage: "REVIEWING" },
    });
    res.status(201).json(application);
  })
);
