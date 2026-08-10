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

export const postingCategorySchema = z.enum(POSTING_CATEGORIES);
export const applicationStageSchema = z.enum(APPLICATION_STAGES);

export const updateApplicationSchema = z.object({
  stage: applicationStageSchema.optional(),
  resumeDocId: z.string().optional(),
  coverDocId: z.string().optional(),
  notes: z.string().optional(),
  appliedAt: z.string().datetime().optional(),
});

export const updatePostingSchema = z.object({
  title: z.string().optional(),
  organization: z.string().optional(),
  location: z.string().optional(),
  category: postingCategorySchema.optional(),
  description: z.string().optional(),
});

export const createDocumentSchema = z.object({
  kind: z.enum(["resume", "cover_letter"]),
  label: z.string().min(1),
  filePath: z.string().min(1),
  isBaseTemplate: z.boolean().optional(),
});

export const paginationSchema = z.object({
  take: z.coerce.number().int().positive().max(500).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});
