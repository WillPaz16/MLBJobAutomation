import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { computeFitScore } from "../fitScore.js";

export const analyticsRouter = Router();

const RESPONSE_TRACKED_STAGES = ["APPLIED", "INTERVIEW", "OFFER", "REJECTED"] as const;

const WEEKS = 26;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// UTC Monday 00:00:00 of the week containing `d` — same definition as ui/src/lib/timeSeries.ts's
// startOfWeek, duplicated here rather than shared because the API and UI packages don't share a
// lib directory; keep both in sync if the week-boundary definition ever changes.
function startOfWeek(d: Date): number {
  const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(utcMidnight).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  return utcMidnight - daysSinceMonday * DAY_MS;
}

function bucketByWeek(dates: (Date | null)[], weeks: number): number[] {
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const counts = new Array(weeks).fill(0) as number[];
  const earliest = currentWeekStart - (weeks - 1) * WEEK_MS;
  for (const d of dates) {
    if (!d) continue;
    const wk = startOfWeek(d);
    if (wk < earliest || wk > currentWeekStart) continue;
    const idx = weeks - 1 - Math.round((currentWeekStart - wk) / WEEK_MS);
    if (idx >= 0 && idx < weeks) counts[idx] += 1;
  }
  return counts;
}

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

// Pre-bucketed WEEKLY counts (last 26 weeks) for three series, plus per-posting fit scores for
// the Analytics page's histogram. Response shape:
//   {
//     weeks: string[]                 // ISO week-start (UTC Monday) dates, oldest -> newest, length 26
//     discovered: number[]            // count of Posting.discoveredAt falling in each week
//     applicationsCreated: number[]   // count of Application.createdAt falling in each week
//     applied: number[]               // count of Application.appliedAt falling in each week
//     fitScores: number[]             // one score (0-100) per posting that has a CandidateProfile match
//   }
// This exists instead of bucketing client-side because the alternative is 2-3 full
// GET /api/postings fetches (with descriptions — several MB post-Phase-0-backfill) just to read
// out three timestamp columns. fitScores is included here (not a separate endpoint) for the same
// reason: postings.ts's own scoring path (`?sort=fit_desc`) returns full posting rows including
// descriptions, which is exactly the heavy payload this endpoint exists to avoid — so this fetches
// only the narrow fields computeFitScore actually needs and returns just the numbers.
analyticsRouter.get(
  "/timeseries",
  asyncHandler(async (_req, res) => {
    const [postings, applications, profile] = await Promise.all([
      prisma.posting.findMany({ select: { discoveredAt: true } }),
      prisma.application.findMany({ select: { createdAt: true, appliedAt: true } }),
      prisma.candidateProfile.findUnique({ where: { id: "profile" } }),
    ]);

    const discovered = bucketByWeek(postings.map((p) => p.discoveredAt), WEEKS);
    const applicationsCreated = bucketByWeek(applications.map((a) => a.createdAt), WEEKS);
    const applied = bucketByWeek(applications.map((a) => a.appliedAt), WEEKS);

    const now = new Date();
    const currentWeekStart = startOfWeek(now);
    const weeks = Array.from({ length: WEEKS }, (_, i) => {
      const t = currentWeekStart - (WEEKS - 1 - i) * WEEK_MS;
      return new Date(t).toISOString().slice(0, 10);
    });

    let fitScores: number[] = [];
    if (profile) {
      const scorable = await prisma.posting.findMany({
        select: { title: true, organization: true, category: true, location: true, description: true },
      });
      fitScores = scorable.map((p) => computeFitScore(p, profile).score);
    }

    res.json({ weeks, discovered, applicationsCreated, applied, fitScores });
  })
);
