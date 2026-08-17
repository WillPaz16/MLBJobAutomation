import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { putCandidateProfileSchema } from "../validation.js";
import { computeFitScore, countSkillMatches, fitTier } from "../fitScore.js";
import { embedText } from "../embeddings.js";
import { CANDIDATE_SKILL_VOCABULARY } from "../skillVocabulary.js";

export const profileRouter = Router();

// Same profile shape computeCoverage needs, whether it came from Prisma (GET) or a parsed-but-
// unsaved PUT body (POST /coverage/preview) — the preview path never has an `id`/`updatedAt`.
type CoverageProfileInput = {
  skills: string;
  coreSkills?: string | null;
  preferredCategories?: string | null;
  locationKeywords?: string | null;
  excludeKeywords?: string | null;
  highestEducationLevel?: string | null;
  embedding?: string | null;
};

// Same split/trim/lowercase logic as fitScore.ts's splitKeywords — kept in lockstep deliberately
// (not imported, since fitScore.ts doesn't export it) so a skill-count mismatch can't silently
// creep in; both are one line and unlikely to drift, but if fitScore.ts's version ever changes,
// mirror it here too.
function splitKeywords(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

// Narrow select — same discipline as analytics.ts's /timeseries (avoid a heavy multi-KB
// description payload per row when only a handful of fields feed scoring/aggregation).
const COVERAGE_POSTING_SELECT = {
  id: true,
  title: true,
  organization: true,
  category: true,
  location: true,
  description: true,
  dismissedAt: true,
  educationRequirement: true,
  embedding: true,
} as const;

// Top N candidate-vocabulary terms not already in the profile, ranked by how many active
// postings mention them — the "what should I add to my resume" signal. Deliberately only computed
// when asked (see includeSkillGaps below): it's an extra regex pass over every active posting on
// top of the existing per-skill matching this function already does, and skill gaps describe the
// overall posting pool rather than something that needs to re-derive on every debounced keystroke
// of an unsaved draft preview.
function computeSkillGaps(
  haystacks: string[],
  existingTerms: string[]
): { term: string; postings: number }[] {
  const existing = new Set(existingTerms);
  const gaps = CANDIDATE_SKILL_VOCABULARY.filter((term) => !existing.has(term)).map((term) => {
    let postingsMatched = 0;
    for (const haystack of haystacks) {
      if (countSkillMatches(haystack, term) > 0) postingsMatched++;
    }
    return { term, postings: postingsMatched };
  });
  return gaps
    .filter((g) => g.postings > 0)
    .sort((a, b) => b.postings - a.postings)
    .slice(0, 15);
}

async function computeCoverage(profile: CoverageProfileInput | null, options: { includeSkillGaps?: boolean } = {}) {
  // Scoped to `closedAt: null` only (active postings), NOT `dismissedAt: null` — dismissed
  // postings must stay in this set so calibration below can compute a real dismissedAvg/dismissed
  // count. `totalPostings` (Discovery's default active+non-dismissed view scope) is then derived
  // as a subset count of this same fetched set, not a second query.
  const postings = await prisma.posting.findMany({
    where: { closedAt: null },
    select: COVERAGE_POSTING_SELECT,
  });

  const totalPostings = postings.filter((p) => !p.dismissedAt).length;

  if (!profile) {
    return {
      totalPostings,
      skills: [],
      skillGaps: [],
      fitScores: [],
      tierCounts: { Strong: 0, Good: 0, Fair: 0, Weak: 0 },
      calibration: { dismissedAvg: null, dismissedCount: 0, appliedAvg: null, appliedCount: 0 },
    };
  }

  // Build the same haystack computeFitScore uses internally (title + organization +
  // description) so countSkillMatches's counts can never disagree with what fed the score.
  const haystacks = postings.map((p) => `${p.title} ${p.organization} ${p.description ?? ""}`);

  const coreSkillTerms = splitKeywords(profile.coreSkills);
  const secondarySkillTerms = splitKeywords(profile.skills).filter((s) => !coreSkillTerms.includes(s));

  const skills = [
    ...coreSkillTerms.map((term) => ({ term, tier: "core" as const })),
    ...secondarySkillTerms.map((term) => ({ term, tier: "secondary" as const })),
  ].map(({ term, tier }) => {
    let postingsMatched = 0;
    let occurrences = 0;
    for (const haystack of haystacks) {
      const count = countSkillMatches(haystack, term);
      if (count > 0) postingsMatched++;
      occurrences += count;
    }
    return { term, tier, postings: postingsMatched, occurrences };
  });

  // With applications/dismissedAt already selected on `postings`, we need the linked Application
  // count per posting for the calibration split below — a second narrow query rather than
  // widening COVERAGE_POSTING_SELECT with a full `applications: true` include.
  const applicationCounts = await prisma.application.groupBy({
    by: ["postingId"],
    where: { postingId: { in: postings.map((p) => p.id) } },
    _count: { postingId: true },
  });
  const appliedPostingIds = new Set(applicationCounts.map((a) => a.postingId));

  const fitScores: number[] = [];
  const tierCounts = { Strong: 0, Good: 0, Fair: 0, Weak: 0 };
  let dismissedSum = 0;
  let dismissedCount = 0;
  let appliedSum = 0;
  let appliedCount = 0;

  for (const posting of postings) {
    const { score } = computeFitScore(posting, profile);
    fitScores.push(score);
    tierCounts[fitTier(score)]++;

    const hasApplication = appliedPostingIds.has(posting.id);

    if (posting.dismissedAt) {
      dismissedSum += score;
      dismissedCount++;
    }
    if (hasApplication) {
      appliedSum += score;
      appliedCount++;
    }
  }

  const skillGaps = options.includeSkillGaps
    ? computeSkillGaps(haystacks, [...coreSkillTerms, ...secondarySkillTerms])
    : [];

  return {
    totalPostings,
    skills,
    skillGaps,
    fitScores,
    tierCounts,
    calibration: {
      dismissedAvg: dismissedCount > 0 ? dismissedSum / dismissedCount : null,
      dismissedCount,
      appliedAvg: appliedCount > 0 ? appliedSum / appliedCount : null,
      appliedCount,
    },
  };
}

// Registered before "/" has no id-param conflict (profile is a singleton, there's no "/:id"
// route here) — kept before "/" anyway to match this codebase's more-specific-first convention.
profileRouter.get(
  "/coverage",
  asyncHandler(async (_req, res) => {
    const profile = await prisma.candidateProfile.findUnique({ where: { id: "profile" } });
    res.json(await computeCoverage(profile, { includeSkillGaps: true }));
  })
);

// Scores an unsaved draft profile (e.g. mid-edit on Compatibility) WITHOUT persisting it —
// reuses the same putCandidateProfileSchema the real PUT / uses, so validation can't drift.
profileRouter.post(
  "/coverage/preview",
  asyncHandler(async (req, res) => {
    const draft = putCandidateProfileSchema.parse(req.body);
    res.json(await computeCoverage(draft));
  })
);

// Singleton candidate profile (id: "profile") used for fit scoring (see ../fitScore.ts).
profileRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const profile = await prisma.candidateProfile.findUnique({ where: { id: "profile" } });
    res.json(profile);
  })
);

profileRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = putCandidateProfileSchema.parse(req.body);

    // Best-effort: an unreachable local Ollama server must never block saving the profile — just
    // leaves embedding unset (fitScore.ts's semantic term treats a missing embedding as a no-op).
    let embedding: string | undefined;
    try {
      const vector = await embedText(`${data.coreSkills ?? ""} ${data.skills}`);
      embedding = JSON.stringify(vector);
    } catch (err) {
      console.error("Failed to compute profile embedding (Ollama unreachable?):", err);
    }

    const profile = await prisma.candidateProfile.upsert({
      where: { id: "profile" },
      update: { ...data, ...(embedding !== undefined ? { embedding } : {}) },
      create: { id: "profile", ...data, ...(embedding !== undefined ? { embedding } : {}) },
    });
    res.json(profile);
  })
);
