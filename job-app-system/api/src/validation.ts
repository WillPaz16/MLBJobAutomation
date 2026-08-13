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
export const POSTING_EDUCATION_REQUIREMENTS = ["NONE", "BACHELORS", "MASTERS", "PHD"] as const;

export const postingCategorySchema = z.enum(POSTING_CATEGORIES);
export const postingSenioritySchema = z.enum(POSTING_SENIORITIES);
export const postingWorkModeSchema = z.enum(POSTING_WORK_MODES);
export const postingRegionSchema = z.enum(POSTING_REGIONS);
export const postingEducationRequirementSchema = z.enum(POSTING_EDUCATION_REQUIREMENTS);
export const applicationStageSchema = z.enum(APPLICATION_STAGES);

export const updateApplicationSchema = z.object({
  stage: applicationStageSchema.optional(),
  order: z.number().int().optional(),
  resumeDocId: z.string().nullable().optional(),
  coverDocId: z.string().nullable().optional(),
  notes: z.string().optional(),
  appliedAt: z.string().datetime().optional(),
});

// POST /api/applications/reorder — batch persistence for Pipeline's drag/move actions. Each entry
// carries the FULL new state for that row (stage + order), computed client-side by
// ui/src/lib/reorder.ts against the unfiltered application list, so the transaction below can
// just write what it's given rather than re-deriving order itself.
export const reorderApplicationsSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        stage: applicationStageSchema,
        order: z.number().int().nonnegative(),
      })
    )
    .min(1),
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
  educationRequirement: postingEducationRequirementSchema.nullable().optional(),
  description: z.string().optional(),
  duplicateRejected: z.boolean().optional(),
  dismissedAt: z.string().datetime().nullable().optional(),
});

export const createDocumentSchema = z.object({
  kind: z.enum(["resume", "cover_letter"]),
  label: z.string().min(1),
  filePath: z.string().min(1),
  isBaseTemplate: z.boolean().optional(),
});

export const registerDocumentSchema = z.object({
  sourcePath: z.string().min(1),
  kind: z.enum(["resume", "cover_letter"]),
  label: z.string().min(1).optional(),
  isBaseTemplate: z.boolean().optional(),
  applicationId: z.string().optional(),
  attachAs: z.enum(["resume", "cover"]).optional(),
});

// Shared by documents.ts and applications.ts, both of which have UI call sites that
// deliberately omit `take` and rely on getting the full list back (Pipeline's Kanban board,
// Documents' list page, Prep's REVIEWING-application scan all call `.list()` with no `take`) —
// so this base schema stays unbounded-by-default. GET /api/postings gets its own
// `postingsPaginationSchema` below instead of a shared default, specifically because its cohort
// just tripled in size and its response body was measured at up to 13MB with an omitted `take`;
// bounding this shared schema instead would have silently truncated Pipeline/Documents/Prep.
export const paginationSchema = z.object({
  take: z.coerce.number().int().positive().max(500).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

// GET /api/postings-only: defaults `take` to 100 so an omitted `take` can't return an entire
// 1,800+-row cohort as a multi-MB JSON body (confirmed live this session). This only bounds the
// RESPONSE — postings.ts's internal full-cohort fetch used for percentile-ranking does not read
// `take`/`skip` at all (it fetches the whole matching cohort unconditionally, then slices for the
// response afterward), so this default doesn't touch that computation. The only UI call site
// (ui/src/pages/Discovery.tsx) already always passes an explicit `take`, so this only changes
// behavior for direct/curl callers that omit it.
export const postingsPaginationSchema = z.object({
  take: z.coerce.number().int().positive().max(500).default(100),
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

// Express query params always arrive as strings; z.coerce.boolean() is Boolean(str), which makes
// "false" true. Use an explicit enum instead, matching the pattern postings.ts already handles
// inline for its own boolean params.
export const booleanQuerySchema = z.enum(["true", "false"]).transform((v) => v === "true");

// Optional filters for GET /api/analytics/summary (and reused by /funnel where sensible).
// All-time/no-filter by default so existing callers (Home.tsx, pre-existing tests) that pass no
// query params are unaffected.
export const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: postingCategorySchema.optional(),
  isMlbTeam: booleanQuerySchema.optional(),
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

// ApplicantIdentity PUT — every field optional/nullable, mirroring the model itself (every column
// is nullable there since a partially-filled identity is normal). Deliberately NOT shared with any
// scoring endpoint (unlike putCandidateProfileSchema) — see identity.ts / schema.prisma comments.
// dateOfBirth (and EducationEntry's start/endDate below) are validated as "YYYY-MM-DD"-shaped
// strings, not z.string().datetime() — they're plain date strings, never DateTime, specifically to
// avoid Prisma+SQLite's UTC-shift round-trip bug.
const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "expected YYYY-MM-DD or YYYY-MM")
  .nullable();

export const putApplicantIdentitySchema = z.object({
  legalFirstName: z.string().nullable().optional(),
  legalMiddleName: z.string().nullable().optional(),
  legalLastName: z.string().nullable().optional(),
  preferredName: z.string().nullable().optional(),

  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),

  addressStreet: z.string().nullable().optional(),
  addressCity: z.string().nullable().optional(),
  addressState: z.string().nullable().optional(),
  addressZip: z.string().nullable().optional(),
  addressCountry: z.string().nullable().optional(),

  dateOfBirth: dateStringSchema.optional(),

  requiresSponsorship: z.boolean().nullable().optional(),
  authorizedToWorkUs: z.boolean().nullable().optional(),

  genderIdentityCode: z.string().nullable().optional(),
  genderIdentityLabel: z.string().nullable().optional(),
  raceEthnicityCode: z.string().nullable().optional(),
  raceEthnicityLabel: z.string().nullable().optional(),
  disabilityStatusCode: z.string().nullable().optional(),
  disabilityStatusLabel: z.string().nullable().optional(),
  veteranStatusCode: z.string().nullable().optional(),
  veteranStatusLabel: z.string().nullable().optional(),

  linkedinUrl: z.string().nullable().optional(),
  portfolioUrl: z.string().nullable().optional(),
  githubUrl: z.string().nullable().optional(),
  otherUrl: z.string().nullable().optional(),
});

export const createEducationEntrySchema = z.object({
  school: z.string().nullable().optional(),
  degree: z.string().nullable().optional(),
  fieldOfStudy: z.string().nullable().optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  gpa: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
});

export const updateEducationEntrySchema = createEducationEntrySchema.partial();

export const createAnswerSnippetSchema = z.object({
  category: z.string().min(1),
  question: z.string().min(1),
  template: z.string().min(1),
  tags: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateAnswerSnippetSchema = createAnswerSnippetSchema.partial();

export const createAnswerOverrideSchema = z.object({
  applicationId: z.string().min(1),
  questionKey: z.string().min(1),
  answer: z.string().min(1),
  snippetId: z.string().nullable().optional(),
});

export const updateAnswerOverrideSchema = z.object({
  questionKey: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  snippetId: z.string().nullable().optional(),
});
