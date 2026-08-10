import { Router } from "express";
import { prisma } from "../db.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", async (_req, res) => {
  const logs = await prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  res.json(logs);
});

notificationsRouter.post("/summary", async (_req, res) => {
  const newPostings = await prisma.posting.count({
    where: { applications: { none: {} } },
  });
  const stale = await prisma.application.findMany({
    where: { stage: { in: ["APPLIED", "REVIEWING"] } },
  });
  const staleCutoff = Date.now() - 10 * 24 * 60 * 60 * 1000;
  const stalledCount = stale.filter((a) => a.updatedAt.getTime() < staleCutoff).length;

  const summary = `${newPostings} new posting(s) awaiting review. ${stalledCount} application(s) stalled >10 days.`;
  const log = await prisma.notificationLog.create({ data: { summary } });
  res.status(201).json(log);
});
