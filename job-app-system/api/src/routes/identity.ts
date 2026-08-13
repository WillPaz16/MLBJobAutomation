import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import {
  putApplicantIdentitySchema,
  createEducationEntrySchema,
  updateEducationEntrySchema,
} from "../validation.js";

export const identityRouter = Router();

// Singleton ApplicantIdentity (id: "identity") — same GET/PUT-upsert pattern as
// routes/profile.ts's CandidateProfile singleton, but this schema is NOT shared with any
// scoring endpoint (see schema.prisma's ApplicantIdentity doc comment for why that distinction
// matters here).
identityRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const identity = await prisma.applicantIdentity.findUnique({
      where: { id: "identity" },
      include: { education: true },
    });
    res.json(identity);
  })
);

identityRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const data = putApplicantIdentitySchema.parse(req.body);
    const identity = await prisma.applicantIdentity.upsert({
      where: { id: "identity" },
      update: data,
      create: { id: "identity", ...data },
    });
    res.json(identity);
  })
);

// --- Nested EducationEntry CRUD ---

identityRouter.get(
  "/education",
  asyncHandler(async (_req, res) => {
    const entries = await prisma.educationEntry.findMany({
      where: { applicantIdentityId: "identity" },
      orderBy: { isPrimary: "desc" },
    });
    res.json(entries);
  })
);

identityRouter.post(
  "/education",
  asyncHandler(async (req, res) => {
    const data = createEducationEntrySchema.parse(req.body);

    // Ensure the singleton row exists so the FK is always valid, even if PUT / was never called.
    await prisma.applicantIdentity.upsert({
      where: { id: "identity" },
      update: {},
      create: { id: "identity" },
    });

    const entry = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        // Re-sequence exclusivity: unset isPrimary on every sibling entry in the same
        // transaction, same "re-sequence all affected rows" discipline as Pipeline.tsx's
        // Application.order handling.
        await tx.educationEntry.updateMany({
          where: { applicantIdentityId: "identity", isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.educationEntry.create({
        data: { ...data, applicantIdentityId: "identity" },
      });
    });

    res.status(201).json(entry);
  })
);

identityRouter.patch(
  "/education/:id",
  asyncHandler(async (req, res) => {
    const data = updateEducationEntrySchema.parse(req.body);

    const existing = await prisma.educationEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Education entry not found");

    const entry = await prisma.$transaction(async (tx) => {
      if (data.isPrimary) {
        await tx.educationEntry.updateMany({
          where: {
            applicantIdentityId: existing.applicantIdentityId,
            isPrimary: true,
            id: { not: existing.id },
          },
          data: { isPrimary: false },
        });
      }
      return tx.educationEntry.update({ where: { id: req.params.id }, data });
    });

    res.json(entry);
  })
);

identityRouter.delete(
  "/education/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.educationEntry.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Education entry not found");
    await prisma.educationEntry.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
