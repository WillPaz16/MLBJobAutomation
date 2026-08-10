import { prisma } from "./db.js";

export async function generateNotificationSummary() {
  const newPostings = await prisma.posting.count({
    where: { applications: { none: {} } },
  });
  const stale = await prisma.application.findMany({
    where: { stage: { in: ["APPLIED", "REVIEWING"] } },
  });
  const staleCutoff = Date.now() - 10 * 24 * 60 * 60 * 1000;
  const stalledCount = stale.filter((a) => a.updatedAt.getTime() < staleCutoff).length;

  const summary = `${newPostings} new posting(s) awaiting review. ${stalledCount} application(s) stalled >10 days.`;
  return prisma.notificationLog.create({ data: { summary } });
}

export async function logNotificationFailure(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return prisma.notificationLog.create({
    data: { summary: `⚠️ ${context} failed: ${message}` },
  });
}
