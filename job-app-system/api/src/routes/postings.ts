import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { paginationSchema, updatePostingSchema } from "../validation.js";

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
