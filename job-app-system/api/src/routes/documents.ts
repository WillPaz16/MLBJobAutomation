import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { createDocumentSchema, paginationSchema } from "../validation.js";

export const documentsRouter = Router();

documentsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { kind } = req.query;
    const { take, skip } = paginationSchema.parse(req.query);
    const documents = await prisma.document.findMany({
      where: { kind: kind ? (kind as string) : undefined },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    res.json(documents);
  })
);

documentsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createDocumentSchema.parse(req.body);
    const document = await prisma.document.create({
      data: { ...data, isBaseTemplate: data.isBaseTemplate ?? false },
    });
    res.status(201).json(document);
  })
);

documentsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const inUse = await prisma.application.findFirst({
      where: { OR: [{ resumeDocId: req.params.id }, { coverDocId: req.params.id }] },
    });
    if (inUse) throw new HttpError(409, "Document is still assigned to an application");

    await prisma.document.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Document not found");
    });
    res.status(204).end();
  })
);
