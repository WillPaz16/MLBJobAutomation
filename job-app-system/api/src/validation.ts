import { z } from "zod";

export const POSTING_CATEGORIES = [
  "BASEBALL_OPS",
  "BASEBALL_ANALYTICS",
  "BASEBALL_RND",
  "DATA_SCIENCE",
  "OTHER",
] as const;

export const APPLICATION_STAGES = [
  "FOUND",
  "REVIEWING",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const POSTING_SENIORITIES = ["ENTRY", "MID", "SENIOR", "EXECUTIVE"] as const;
export const POSTING_WORK_MODES = ["REMOTE", "HYBRID", "ONSITE"] as const;
export const POSTING_REGIONS = ["USA", "INTERNATIONAL"] as const;

export const postingCategorySchema = z.enum(POSTING_CATEGORIES);
export const postingSenioritySchema = z.enum(POSTING_SENIORITIES);
export const postingWorkModeSchema = z.enum(POSTING_WORK_MODES);
export const postingRegionSchema = z.enum(POSTING_REGIONS);
export const applicationStageSchema = z.enum(APPLICATION_STAGES);

export const updateApplicationSchema = z.object({
  stage: applicationStageSchema.optional(),
  order: z.number().int().optional(),
  resumeDocId: z.string().nullable().optional(),
  coverDocId: z.string().nullable().optional(),
  notes: z.string().optional(),
  appliedAt: z.string().datetime().optional(),
});

export const updatePostingSchema = z.object({
  title: z.string().optional(),
  organization: z.string().optional(),
  location: z.string().optional(),
  category: postingCategorySchema.optional(),
  seniority: postingSenioritySchema.nullable().optional(),
  salary: z.string().nullable().optional(),
  workMode: postingWorkModeSchema.nullable().optional(),
  region: postingRegionSchema.nullable().optional(),
  description: z.string().optional(),
  duplicateRejected: z.boolean().optional(),
  dismissedAt: z.string().datetime().nullable().optional(),
});

export const createDocumentSchema = z.object({
  kind: z.enum(["resume", "cover_letter"]),
  label: z.string().min(1),
  filePath: z.string().min(1),
  isBaseTemplate: z.boolean().optional(),
  generatedFromBulletIds: z.string().optional(),
  toneId: z.string().optional(),
});

export const registerDocumentSchema = z.object({
  sourcePath: z.string().min(1),
  kind: z.enum(["resume", "cover_letter"]),
  label: z.string().min(1).optional(),
  isBaseTemplate: z.boolean().optional(),
  applicationId: z.string().optional(),
  attachAs: z.enum(["resume", "cover"]).optional(),
});

export const paginationSchema = z.object({
  take: z.coerce.number().int().positive().max(500).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

// Validates the one query param on GET /api/postings that can actually be malformed in a way
// that should 400 rather than 500 or silently no-op: discoveredAfter is parsed into a real `Date`
// for a Prisma `gte` filter, so a garbage string (or a param that just isn't a valid date) needs
// to fail loudly here, before it ever reaches Prisma. Every other postings query param is either
// a free-text string (always valid) or a "true"/"false" string-coercion boolean (never throws) —
// see postings.ts's inline comments for why those don't need zod entries of their own.
export const postingsDiscoveredAfterSchema = z.object({
  discoveredAfter: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "discoveredAfter must be a valid date" })
    .optional(),
});

export const createManualPostingSchema = z.object({
  title: z.string().min(1),
  organization: z.string().min(1),
  location: z.string().optional(),
  url: z.string().url(),
  description: z.string().optional(),
  category: postingCategorySchema.optional(),
});

export const createResumeBulletSchema = z.object({
  category: z.string().min(1),
  text: z.string().min(1),
  tags: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateResumeBulletSchema = createResumeBulletSchema.partial();

export const createTonePresetSchema = z.object({
  name: z.string().min(1),
  guidance: z.string().min(1),
  isDefault: z.boolean().optional(),
});

export const updateTonePresetSchema = createTonePresetSchema.partial();

export const createOrgProfileSchema = z.object({
  organizationName: z.string().min(1),
  notes: z.string().optional(),
  preferredToneId: z.string().optional(),
});

export const updateOrgProfileSchema = createOrgProfileSchema.partial();

// Optional filters for GET /api/analytics/summary (and reused by /funnel where sensible).
// All-time/no-filter by default so existing callers (Home.tsx, pre-existing tests) that pass no
// query params are unaffected.
export const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: postingCategorySchema.optional(),
  isMlbTeam: z.coerce.boolean().optional(),
});

export const timeseriesQuerySchema = z.object({
  weeks: z.coerce.number().int().positive().max(104).optional(),
});

export const createSavedSearchSchema = z.object({
  name: z.string().min(1),
  query: z.string(), // URLSearchParams-formatted string; empty string is valid (an all-defaults view)
  isDefault: z.boolean().optional(),
});

export const updateSavedSearchSchema = createSavedSearchSchema.partial();

export const putCandidateProfileSchema = z.object({
  skills: z.string().min(1),
  coreSkills: z.string().optional(),
  preferredCategories: z.string().optional(),
  locationKeywords: z.string().optional(),
  excludeKeywords: z.string().optional(),
});
