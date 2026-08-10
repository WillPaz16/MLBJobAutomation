import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";

export const analyticsRouter = Router();

const RESPONSE_TRACKED_STAGES = ["APPLIED", "INTERVIEW", "OFFER", "REJECTED"] as const;

analyticsRouter.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const applications = await prisma.application.findMany({
      include: { posting: { include: { source: true } } },
    });

    const byStage: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const responseTimesByStage: Record<string, number[]> = {};

    for (const app of applications) {
      byStage[app.stage] = (byStage[app.stage] ?? 0) + 1;
      const sourceName = app.posting.source.name;
      bySource[sourceName] = (bySource[sourceName] ?? 0) + 1;
      if (app.appliedAt && (RESPONSE_TRACKED_STAGES as readonly string[]).includes(app.stage)) {
        const days = (app.updatedAt.getTime() - app.appliedAt.getTime()) / (1000 * 60 * 60 * 24);
        (responseTimesByStage[app.stage] ??= []).push(days);
      }
    }

    const avgResponseDaysByStage: Record<string, number> = {};
    let allResponseTimes: number[] = [];
    for (const [stage, times] of Object.entries(responseTimesByStage)) {
      avgResponseDaysByStage[stage] = times.reduce((a, b) => a + b, 0) / times.length;
      allResponseTimes = allResponseTimes.concat(times);
    }

    const avgResponseDays =
      allResponseTimes.length > 0
        ? allResponseTimes.reduce((a, b) => a + b, 0) / allResponseTimes.length
        : null;

    res.json({ total: applications.length, byStage, bySource, avgResponseDays, avgResponseDaysByStage });
  })
);
