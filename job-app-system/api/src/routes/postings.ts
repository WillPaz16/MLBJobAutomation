import { Router } from "express";
import { createHash } from "crypto";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { createManualPostingSchema, paginationSchema, updatePostingSchema } from "../validation.js";

export const postingsRouter = Router();

postingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category, location, q } = req.query;
    const { take, skip } = paginationSchema.parse(req.query);

    const postings = await prisma.posting.findMany({
      where: {
        category: category ? (category as string) : undefined,
        location: location ? { contains: location as string } : undefined,
        OR: q
          ? [
              { title: { contains: q as string } },
              { organization: { contains: q as string } },
            ]
          : undefined,
      },
      include: { source: true, applications: true },
      orderBy: { discoveredAt: "desc" },
      take,
      skip,
    });
    res.json(postings);
  })
);

postingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const posting = await prisma.posting.findUnique({
      where: { id: req.params.id },
      include: { source: true, applications: true },
    });
    if (!posting) throw new HttpError(404, "Posting not found");
    res.json(posting);
  })
);

postingsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updatePostingSchema.parse(req.body);
    const posting = await prisma.posting
      .update({ where: { id: req.params.id }, data })
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
