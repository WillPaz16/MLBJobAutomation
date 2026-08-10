import { Router } from "express";
import { prisma } from "../db.js";

export const documentsRouter = Router();

documentsRouter.get("/", async (req, res) => {
  const { kind } = req.query;
  const documents = await prisma.document.findMany({
    where: { kind: kind ? (kind as string) : undefined },
    orderBy: { createdAt: "desc" },
  });
  res.json(documents);
});

documentsRouter.post("/", async (req, res) => {
  const { kind, label, filePath, isBaseTemplate } = req.body;
  const document = await prisma.document.create({
    data: { kind, label, filePath, isBaseTemplate: !!isBaseTemplate },
  });
  res.status(201).json(document);
});
