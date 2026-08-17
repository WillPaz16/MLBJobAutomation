import { prisma } from "./db.js";

// Applications a follow-up nudge actually applies to — not FOUND (never applied yet, nothing to
// follow up on) and not a terminal stage (OFFER/REJECTED/WITHDRAWN, already resolved).
export const STALLED_STAGES = ["REVIEWING", "APPLIED", "INTERVIEW"];

export const STALLED_DAYS_THRESHOLD = 14;

// `Application.updatedAt` bumps on ANY write (editing a note resets it), so it's not a reliable
// "days since real activity" signal — ApplicationStageEvent's most recent row per application is.
// Falls back to `updatedAt` only for the rare application with no stage-event row at all (shouldn't
// happen post-backfillStageEvents.ts, but defensive).
//
// Pure check, split out from the query below so callers that already have an application +
// its latest stage event in hand (e.g. GET /api/applications' single findMany) can reuse the same
// logic without a second query.
function getLastActivityAt(application: { updatedAt: Date; stageEvents: { createdAt: Date }[] }): Date {
  return application.stageEvents[0]?.createdAt ?? application.updatedAt;
}

export function isApplicationStalled(application: {
  stage: string;
  updatedAt: Date;
  stageEvents: { createdAt: Date }[];
}): boolean {
  if (!STALLED_STAGES.includes(application.stage)) return false;
  const cutoff = Date.now() - STALLED_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
  return getLastActivityAt(application).getTime() < cutoff;
}

export { getLastActivityAt };

export async function findStalledApplications() {
  const candidates = await prisma.application.findMany({
    where: { stage: { in: STALLED_STAGES } },
    include: { stageEvents: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return candidates.filter(isApplicationStalled);
}
