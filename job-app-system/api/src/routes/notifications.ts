import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { generateNotificationSummary } from "../notifications.js";

export const notificationsRouter = Router();

notificationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const logs = await prisma.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    res.json(logs);
  })
);

notificationsRouter.post(
  "/summary",
  asyncHandler(async (_req, res) => {
    const log = await generateNotificationSummary();
    res.status(201).json(log);
  })
);
