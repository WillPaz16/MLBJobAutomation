import { Router } from "express";
import { prisma } from "../db.js";

export const postingsRouter = Router();

postingsRouter.get("/", async (req, res) => {
  const { category, location } = req.query;
  const postings = await prisma.posting.findMany({
    where: {
      category: category ? (category as string) : undefined,
      location: location ? { contains: location as string } : undefined,
    },
    include: { source: true, applications: true },
    orderBy: { discoveredAt: "desc" },
  });
  res.json(postings);
});

postingsRouter.get("/:id", async (req, res) => {
  const posting = await prisma.posting.findUnique({
    where: { id: req.params.id },
    include: { source: true, applications: true },
  });
  if (!posting) return res.status(404).json({ error: "not found" });
  res.json(posting);
});

postingsRouter.post("/:id/approve", async (req, res) => {
  const posting = await prisma.posting.findUnique({ where: { id: req.params.id } });
  if (!posting) return res.status(404).json({ error: "not found" });
  const application = await prisma.application.create({
    data: { postingId: posting.id, stage: "REVIEWING" },
  });
  res.status(201).json(application);
});
