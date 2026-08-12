import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { computeFitScore } from "../fitScore.js";
import { analyticsQuerySchema, timeseriesQuerySchema } from "../validation.js";

export const analyticsRouter = Router();

const RESPONSE_NEXT_STAGES = ["INTERVIEW", "OFFER", "REJECTED"] as const;

const DEFAULT_WEEKS = 26;
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

function weekLabels(weeks: number): string[] {
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  return Array.from({ length: weeks }, (_, i) => {
    const t = currentWeekStart - (weeks - 1 - i) * WEEK_MS;
    return new Date(t).toISOString().slice(0, 10);
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stats(values: number[]): { median: number | null; mean: number | null; n: number } {
  return { median: median(values), mean: mean(values), n: values.length };
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / DAY_MS;
}

// ---------------------------------------------------------------------------
// GET /summary — optional {from, to, category, isMlbTeam} filters on Application.createdAt /
// its posting. No fake response-time metric anymore (removed avgResponseDays/
// avgResponseDaysByStage — see GET /funnel for the real replacement, driven by
// ApplicationStageEvent instead of `updatedAt`, which bumps on ANY write).
// ---------------------------------------------------------------------------
analyticsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const query = analyticsQuerySchema.parse(req.query);

    const applications = await prisma.application.findMany({
      where: {
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
        posting: {
          category: query.category,
          isMlbTeam: query.isMlbTeam,
        },
      },
      include: { posting: { include: { source: true } } },
    });

    const byStage: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const app of applications) {
      byStage[app.stage] = (byStage[app.stage] ?? 0) + 1;
      const sourceName = app.posting.source.name;
      bySource[sourceName] = (bySource[sourceName] ?? 0) + 1;
    }

    res.json({ total: applications.length, byStage, bySource });
  })
);

// ---------------------------------------------------------------------------
// GET /timeseries — pre-bucketed WEEKLY counts (default 26 weeks, capped 104 via `weeks` query
// param) for three series, plus per-posting fit scores for the Analytics page's histogram.
// Response shape unchanged from before:
//   { weeks: string[], discovered: number[], applicationsCreated: number[], applied: number[],
//     fitScores: number[] }
// Narrow-selects postings (title/organization/category/location/description — exactly what
// computeFitScore needs) instead of full rows, and memoizes the fit-score computation in-process
// keyed on profile.updatedAt + posting count + latest discoveredAt, since none of those change
// between requests unless a posting was ingested or the profile was edited.
// ---------------------------------------------------------------------------
let fitScoreCache: { key: string; fitScores: number[] } | null = null;

analyticsRouter.get(
  "/timeseries",
  asyncHandler(async (req, res) => {
    const { weeks = DEFAULT_WEEKS } = timeseriesQuerySchema.parse(req.query);

    const [postings, applications, profile, postingCount, latestPosting] = await Promise.all([
      prisma.posting.findMany({ select: { discoveredAt: true } }),
      prisma.application.findMany({ select: { createdAt: true, appliedAt: true } }),
      prisma.candidateProfile.findUnique({ where: { id: "profile" } }),
      prisma.posting.count(),
      prisma.posting.findFirst({ orderBy: { discoveredAt: "desc" }, select: { discoveredAt: true } }),
    ]);

    const discovered = bucketByWeek(postings.map((p) => p.discoveredAt), weeks);
    const applicationsCreated = bucketByWeek(applications.map((a) => a.createdAt), weeks);
    const applied = bucketByWeek(applications.map((a) => a.appliedAt), weeks);

    let fitScores: number[] = [];
    if (profile) {
      const cacheKey = `${profile.updatedAt.toISOString()}|${postingCount}|${latestPosting?.discoveredAt.toISOString() ?? "none"}`;
      if (fitScoreCache && fitScoreCache.key === cacheKey) {
        fitScores = fitScoreCache.fitScores;
      } else {
        const scorable = await prisma.posting.findMany({
          select: { title: true, organization: true, category: true, location: true, description: true },
        });
        fitScores = scorable.map((p) => computeFitScore(p, profile).score);
        fitScoreCache = { key: cacheKey, fitScores };
      }
    }

    res.json({ weeks: weekLabels(weeks), discovered, applicationsCreated, applied, fitScores });
  })
);

// ---------------------------------------------------------------------------
// GET /funnel — real funnel built from ApplicationStageEvent, replacing the old fake
// avgResponseDays metric (which used `updatedAt`, bumped by ANY write, not just a stage change).
//
// Response shape:
//   {
//     reached: Record<stage, number>            // # applications that ever had an event into `stage`
//     conversion: Record<stage, number | null>  // reached[stage] / reached["APPLIED"], null if
//                                                // reached["APPLIED"] === 0 (never NaN/Infinity)
//     daysInStage: Record<stage, {median, mean, n}>
//     medianDaysToResponse: number | null
//     meanDaysToResponse: number | null
//     sampleSizes: { totalApplications, appliedReached, responseSampleSize }
//   }
//
// `source: "backfill"` events count toward `reached`/`conversion` (a backfilled application
// really did reach that stage, timing aside) but are EXCLUDED from all duration math
// (daysInStage, response time) since their timestamps are copied from createdAt/updatedAt, not
// real transition times — a gap is only computed between two consecutive "api"-sourced events.
// ---------------------------------------------------------------------------
analyticsRouter.get(
  "/funnel",
  asyncHandler(async (req, res) => {
    const query = analyticsQuerySchema.parse(req.query);

    const applications = await prisma.application.findMany({
      where: {
        createdAt: {
          gte: query.from ? new Date(query.from) : undefined,
          lte: query.to ? new Date(query.to) : undefined,
        },
        posting: {
          category: query.category,
          isMlbTeam: query.isMlbTeam,
        },
      },
      include: { stageEvents: { orderBy: { createdAt: "asc" } } },
    });

    const reached: Record<string, number> = {};
    const daysInStageValues: Record<string, number[]> = {};
    const responseDays: number[] = [];

    for (const app of applications) {
      const events = app.stageEvents;
      const seenStages = new Set<string>();
      for (const event of events) {
        if (!seenStages.has(event.toStage)) {
          reached[event.toStage] = (reached[event.toStage] ?? 0) + 1;
          seenStages.add(event.toStage);
        }
      }

      // Duration math: only over consecutive pairs of "api"-sourced events (both the stage-entry
      // event and the next event) — a backfill event on either side means we don't actually know
      // the real transition time, so the gap is skipped entirely rather than guessed at.
      for (let i = 0; i < events.length - 1; i++) {
        const entry = events[i];
        const next = events[i + 1];
        if (entry.source !== "api" || next.source !== "api") continue;
        const days = daysBetween(entry.createdAt, next.createdAt);
        (daysInStageValues[entry.toStage] ??= []).push(days);
      }

      // Response time: days from the APPLIED event to the first subsequent event into
      // INTERVIEW/OFFER/REJECTED, both "api"-sourced.
      const appliedIndex = events.findIndex((e) => e.toStage === "APPLIED" && e.source === "api");
      if (appliedIndex !== -1) {
        for (let j = appliedIndex + 1; j < events.length; j++) {
          const candidate = events[j];
          if (candidate.source !== "api") continue;
          if ((RESPONSE_NEXT_STAGES as readonly string[]).includes(candidate.toStage)) {
            responseDays.push(daysBetween(events[appliedIndex].createdAt, candidate.createdAt));
            break;
          }
        }
      }
    }

    const appliedReached = reached["APPLIED"] ?? 0;
    const conversion: Record<string, number | null> = {};
    for (const stage of Object.keys(reached)) {
      conversion[stage] = appliedReached > 0 ? reached[stage] / appliedReached : null;
    }

    const daysInStage: Record<string, { median: number | null; mean: number | null; n: number }> = {};
    for (const [stage, values] of Object.entries(daysInStageValues)) {
      daysInStage[stage] = stats(values);
    }

    res.json({
      reached,
      conversion,
      daysInStage,
      medianDaysToResponse: median(responseDays),
      meanDaysToResponse: mean(responseDays),
      sampleSizes: {
        totalApplications: applications.length,
        appliedReached,
        responseSampleSize: responseDays.length,
      },
    });
  })
);

// ---------------------------------------------------------------------------
// GET /market — market-side aggregation, all computed server-side (never ships raw posting rows
// with descriptions to the browser). Computed over ACTIVE-scope postings (closedAt: null) except
// where noted below.
//
// Response shape:
//   {
//     timeToClose: {
//       bucketLabels: string[],                 // e.g. "0-7", "8-14", "15-30", "31-60", "60+"
//       mlb: number[], nonMlb: number[],         // parallel to bucketLabels, over CLOSED postings
//       postedAtBasedCount: number,              // used real postedAt
//       discoveredAtFallbackCount: number,        // fell back to discoveredAt
//     },
//     discoveryLag: { median: number|null, mean: number|null, n: number },  // over postings w/ postedAt
//     dismissalBreakdown: {
//       category: {key,label,value}[], seniority: [...], workMode: [...], region: [...]
//     },  // over ALL dismissed postings, any status
//     fitScoreByCohort: {
//       dismissed: {median,mean,n}, applied: {median,mean,n}, other: {median,mean,n}
//     },  // over active-scope postings, cohorts are mutually exclusive
//     supplyMix: {
//       weeks: string[], active: number[], closed: number[],   // by discoveredAt week, last N weeks
//       bySeniority: {key,label,value}[], byWorkMode: [...], byRegion: [...], byMlbTeam: [...]
//     }  // breakdowns over ALL postings (any status)
//   }
// ---------------------------------------------------------------------------
const TIME_TO_CLOSE_BUCKETS: { label: string; max: number }[] = [
  { label: "0-7", max: 7 },
  { label: "8-14", max: 14 },
  { label: "15-30", max: 30 },
  { label: "31-60", max: 60 },
  { label: "60+", max: Infinity },
];

function bucketIndex(days: number): number {
  for (let i = 0; i < TIME_TO_CLOSE_BUCKETS.length; i++) {
    if (days <= TIME_TO_CLOSE_BUCKETS[i].max) return i;
  }
  return TIME_TO_CLOSE_BUCKETS.length - 1;
}

function toBarList(counts: Record<string, number>): { key: string; label: string; value: number }[] {
  return Object.entries(counts)
    .map(([key, value]) => ({ key, label: key, value }))
    .sort((a, b) => b.value - a.value);
}

const MARKET_FIT_POSTING_SELECT = {
  id: true,
  title: true,
  organization: true,
  category: true,
  location: true,
  description: true,
  dismissedAt: true,
} as const;

analyticsRouter.get(
  "/market",
  asyncHandler(async (_req, res) => {
    const [closedPostings, postedPostings, dismissedPostings, activePostings, allPostings, profile] =
      await Promise.all([
        prisma.posting.findMany({
          where: { closedAt: { not: null } },
          select: { postedAt: true, discoveredAt: true, closedAt: true, isMlbTeam: true },
        }),
        prisma.posting.findMany({
          where: { postedAt: { not: null } },
          select: { postedAt: true, discoveredAt: true },
        }),
        prisma.posting.findMany({
          where: { dismissedAt: { not: null } },
          select: { category: true, seniority: true, workMode: true, region: true },
        }),
        prisma.posting.findMany({
          where: { closedAt: null },
          select: MARKET_FIT_POSTING_SELECT,
        }),
        prisma.posting.findMany({
          select: { discoveredAt: true, closedAt: true, seniority: true, workMode: true, region: true, isMlbTeam: true },
        }),
        prisma.candidateProfile.findUnique({ where: { id: "profile" } }),
      ]);

    // --- time-to-close ---
    const mlbBuckets = new Array(TIME_TO_CLOSE_BUCKETS.length).fill(0) as number[];
    const nonMlbBuckets = new Array(TIME_TO_CLOSE_BUCKETS.length).fill(0) as number[];
    let postedAtBasedCount = 0;
    let discoveredAtFallbackCount = 0;
    for (const p of closedPostings) {
      if (!p.closedAt) continue;
      const start = p.postedAt ?? p.discoveredAt;
      if (p.postedAt) postedAtBasedCount++;
      else discoveredAtFallbackCount++;
      const days = daysBetween(start, p.closedAt);
      const idx = bucketIndex(Math.max(0, days));
      if (p.isMlbTeam) mlbBuckets[idx]++;
      else nonMlbBuckets[idx]++;
    }

    // --- discovery lag ---
    const lagDays = postedPostings
      .filter((p) => p.postedAt)
      .map((p) => daysBetween(p.postedAt as Date, p.discoveredAt));
    const discoveryLag = stats(lagDays);

    // --- dismissal breakdown ---
    const byCategory: Record<string, number> = {};
    const bySeniorityDismissed: Record<string, number> = {};
    const byWorkModeDismissed: Record<string, number> = {};
    const byRegionDismissed: Record<string, number> = {};
    for (const p of dismissedPostings) {
      byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
      if (p.seniority) bySeniorityDismissed[p.seniority] = (bySeniorityDismissed[p.seniority] ?? 0) + 1;
      if (p.workMode) byWorkModeDismissed[p.workMode] = (byWorkModeDismissed[p.workMode] ?? 0) + 1;
      if (p.region) byRegionDismissed[p.region] = (byRegionDismissed[p.region] ?? 0) + 1;
    }

    // --- fit score by cohort (dismissed / has application / everything else), over active-scope
    // postings only, mutually exclusive cohorts ---
    const dismissedScores: number[] = [];
    const appliedScores: number[] = [];
    const otherScores: number[] = [];
    if (profile) {
      const activeIds = activePostings.map((p) => p.id);
      const applicationCounts = await prisma.application.groupBy({
        by: ["postingId"],
        where: { postingId: { in: activeIds } },
        _count: { postingId: true },
      });
      const appliedPostingIds = new Set(applicationCounts.map((a) => a.postingId));

      for (const p of activePostings) {
        const { score } = computeFitScore(p, profile);
        if (p.dismissedAt) dismissedScores.push(score);
        else if (appliedPostingIds.has(p.id)) appliedScores.push(score);
        else otherScores.push(score);
      }
    }

    // --- supply mix over time (active vs closed, by discoveredAt week) + full breakdowns ---
    const weeks = DEFAULT_WEEKS;
    const activeByWeek = bucketByWeek(
      allPostings.filter((p) => !p.closedAt).map((p) => p.discoveredAt),
      weeks
    );
    const closedByWeek = bucketByWeek(
      allPostings.filter((p) => p.closedAt).map((p) => p.discoveredAt),
      weeks
    );

    const bySeniorityAll: Record<string, number> = {};
    const byWorkModeAll: Record<string, number> = {};
    const byRegionAll: Record<string, number> = {};
    const byMlbTeamAll: Record<string, number> = { MLB: 0, "Non-MLB": 0 };
    for (const p of allPostings) {
      if (p.seniority) bySeniorityAll[p.seniority] = (bySeniorityAll[p.seniority] ?? 0) + 1;
      if (p.workMode) byWorkModeAll[p.workMode] = (byWorkModeAll[p.workMode] ?? 0) + 1;
      if (p.region) byRegionAll[p.region] = (byRegionAll[p.region] ?? 0) + 1;
      byMlbTeamAll[p.isMlbTeam ? "MLB" : "Non-MLB"]++;
    }

    res.json({
      timeToClose: {
        bucketLabels: TIME_TO_CLOSE_BUCKETS.map((b) => b.label),
        mlb: mlbBuckets,
        nonMlb: nonMlbBuckets,
        postedAtBasedCount,
        discoveredAtFallbackCount,
      },
      discoveryLag,
      dismissalBreakdown: {
        category: toBarList(byCategory),
        seniority: toBarList(bySeniorityDismissed),
        workMode: toBarList(byWorkModeDismissed),
        region: toBarList(byRegionDismissed),
      },
      fitScoreByCohort: {
        dismissed: stats(dismissedScores),
        applied: stats(appliedScores),
        other: stats(otherScores),
      },
      supplyMix: {
        weeks: weekLabels(weeks),
        active: activeByWeek,
        closed: closedByWeek,
        bySeniority: toBarList(bySeniorityAll),
        byWorkMode: toBarList(byWorkModeAll),
        byRegion: toBarList(byRegionAll),
        byMlbTeam: toBarList(byMlbTeamAll),
      },
    });
  })
);
