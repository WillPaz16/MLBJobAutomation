import { Router } from "express";
import { prisma } from "../db.js";

export const applicationsRouter = Router();

applicationsRouter.get("/", async (req, res) => {
  const applications = await prisma.application.findMany({
    include: { posting: { include: { source: true } }, resumeDoc: true, coverDoc: true },
    orderBy: { updatedAt: "desc" },
  });
  res.json(applications);
});

applicationsRouter.patch("/:id", async (req, res) => {
  const { stage, resumeDocId, coverDocId, notes, appliedAt } = req.body;
  const application = await prisma.application.update({
    where: { id: req.params.id },
    data: {
      stage,
      resumeDocId,
      coverDocId,
      notes,
      appliedAt: appliedAt ? new Date(appliedAt) : undefined,
    },
  });
  res.json(application);
});

applicationsRouter.delete("/:id", async (req, res) => {
  await prisma.application.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
