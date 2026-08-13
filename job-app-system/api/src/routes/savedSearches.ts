import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { createSavedSearchSchema, updateSavedSearchSchema } from "../validation.js";

export const savedSearchesRouter = Router();

savedSearchesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.savedSearch.findMany({ orderBy: { createdAt: "asc" } }));
  })
);

savedSearchesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createSavedSearchSchema.parse(req.body);
    // Same "exclusivity enforced in a transaction" discipline CLAUDE.md documents for
    // Application.order/EducationEntry.isPrimary — only one saved search can be the default at a
    // time, so setting this one true must atomically un-default every other row.
    const created = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.savedSearch.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.savedSearch.create({ data });
    });
    res.status(201).json(created);
  })
);

savedSearchesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSavedSearchSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.savedSearch.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.savedSearch
        .update({ where: { id: req.params.id }, data })
        .catch(() => {
          throw new HttpError(404, "Saved search not found");
        });
    });
    res.json(updated);
  })
);

savedSearchesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.savedSearch.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Saved search not found");
    });
    res.status(204).end();
  })
);
