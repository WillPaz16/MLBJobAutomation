import { prisma } from "./db.js";
import { findStalledApplications, STALLED_DAYS_THRESHOLD } from "./applicationStaleness.js";

export async function generateNotificationSummary() {
  const newPostings = await prisma.posting.count({
    where: { applications: { none: {} } },
  });
  const stalledCount = (await findStalledApplications()).length;

  const summary = `${newPostings} new posting(s) awaiting review. ${stalledCount} application(s) stalled >${STALLED_DAYS_THRESHOLD} days.`;
  return prisma.notificationLog.create({ data: { summary } });
}

export async function logNotificationFailure(context: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return prisma.notificationLog.create({
    data: { summary: `⚠️ ${context} failed: ${message}` },
  });
}
