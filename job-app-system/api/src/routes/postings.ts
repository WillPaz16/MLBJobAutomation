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
  profile: { skills: string; preferredCategories: string | null; locationKeywords: string | null; excludeKeywords: string | null } | null
): T & { fitScore?: number; matchedSkills?: string[] } {
  if (!profile) return posting;
  const { score, matchedSkills } = computeFitScore(posting, profile);
  return { ...posting, fitScore: score, matchedSkills };
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
    const { category, location, q, source, organization, status, sort, hideDuplicates, showDismissed } = req.query;
    const { take, skip } = paginationSchema.parse(req.query);

    const statusFilter =
      status === "closed" ? { closedAt: { not: null } } : status === "all" ? {} : { closedAt: null };

    const where = {
      category: category ? (category as string) : undefined,
      location: location ? { contains: location as string } : undefined,
      source: source ? { type: source as string } : undefined,
      organization: organization ? (organization as string) : undefined,
      dismissedAt: showDismissed === "true" ? undefined : null,
      ...statusFilter,
      AND: [
        q ? { OR: [{ title: { contains: q as string } }, { organization: { contains: q as string } }] } : {},
        hideDuplicates === "true" ? { OR: [{ possibleDuplicateOfId: null }, { duplicateRejected: true }] } : {},
      ],
    };

    const profile = await prisma.candidateProfile.findUnique({ where: { id: "profile" } });

    if (sort === "fit_desc") {
      // Fit score isn't a DB column, so it can't go through Prisma's orderBy — fetch every
      // matching row (no take/skip here), score+sort in JS, then slice the page ourselves.
      const [allPostings, total] = await Promise.all([
        prisma.posting.findMany({
          where,
          include: { source: true, applications: true, possibleDuplicateOf: true },
        }),
        prisma.posting.count({ where }),
      ]);
      const scored = allPostings.map((p) => withFitScore(p, profile));
      scored.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0));
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

postingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const posting = await prisma.posting.findUnique({
      where: { id: req.params.id },
      include: { source: true, applications: true, possibleDuplicateOf: true },
    });
    if (!posting) throw new HttpError(404, "Posting not found");
    res.json(posting);
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
