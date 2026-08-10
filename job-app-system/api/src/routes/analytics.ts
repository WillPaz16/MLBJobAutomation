import { Router } from "express";
import { prisma } from "../db.js";

export const analyticsRouter = Router();

analyticsRouter.get("/summary", async (_req, res) => {
  const applications = await prisma.application.findMany({ include: { posting: { include: { source: true } } } });

  const byStage: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let responseTimes: number[] = [];

  for (const app of applications) {
    byStage[app.stage] = (byStage[app.stage] ?? 0) + 1;
    const sourceName = app.posting.source.name;
    bySource[sourceName] = (bySource[sourceName] ?? 0) + 1;
    if (app.appliedAt && app.stage !== "FOUND" && app.stage !== "REVIEWING") {
      responseTimes.push((app.updatedAt.getTime() - app.appliedAt.getTime()) / (1000 * 60 * 60 * 24));
    }
  }

  const avgResponseDays =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null;

  res.json({ total: applications.length, byStage, bySource, avgResponseDays });
});
