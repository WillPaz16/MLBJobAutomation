import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { paginationSchema, updateApplicationSchema } from "../validation.js";

export const applicationsRouter = Router();

applicationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { take, skip } = paginationSchema.parse(req.query);
    const applications = await prisma.application.findMany({
      include: { posting: { include: { source: true } }, resumeDoc: true, coverDoc: true },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    });
    res.json(applications);
  })
);

// Collapses the tailor-application skill's steps 1-4 (four separate curls: application+posting,
// org profile, tone presets, resume bullets) into one call. ResumeBullet.category is a loose,
// lowercase string ("baseball_analytics", "general") while Posting.category is the uppercase
// PostingCategory value — matched case-insensitively, plus always including "general" bullets.
applicationsRouter.get(
  "/:id/prep-context",
  asyncHandler(async (req, res) => {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { posting: true, resumeDoc: true, coverDoc: true },
    });
    if (!application) throw new HttpError(404, "Application not found");

    const orgProfile = await prisma.orgProfile.findUnique({
      where: { organizationName: application.posting.organization },
      include: { preferredTone: true },
    });

    const tonePreset =
      orgProfile?.preferredTone ??
      (await prisma.tonePreset.findFirst({ where: { isDefault: true } }));

    const postingCategoryLower = application.posting.category.toLowerCase();
    const resumeBullets = await prisma.resumeBullet.findMany({
      where: {
        isActive: true,
        OR: [{ category: postingCategoryLower }, { category: "general" }],
      },
    });

    res.json({ application, orgProfile, tonePreset, resumeBullets });
  })
);

// Single choke point for writing ApplicationStageEvent rows on a real stage change (see the
// model's doc comment in schema.prisma). appliedAt is also decided here, server-side, in the
// same transaction — entering APPLIED sets it (only if not already set), and moving to any OTHER
// stage never clears an already-set appliedAt. The client (ui/src/pages/Pipeline.tsx) used to
// compute/send appliedAt itself; that duplicated this exact logic and is now removed so there's
// one owner of the field.
applicationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateApplicationSchema.parse(req.body);

    const existing = await prisma.application.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Application not found");

    const stageChanged = data.stage !== undefined && data.stage !== existing.stage;

    const application = await prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: req.params.id },
        data: {
          ...data,
          appliedAt: data.appliedAt
            ? new Date(data.appliedAt)
            : data.stage === "APPLIED" && !existing.appliedAt
              ? new Date()
              : undefined,
        },
      });

      if (stageChanged) {
        await tx.applicationStageEvent.create({
          data: {
            applicationId: existing.id,
            fromStage: existing.stage,
            toStage: data.stage as string,
            source: "api",
          },
        });
      }

      return updated;
    });

    res.json(application);
  })
);

applicationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.application.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Application not found");
    });
    res.status(204).end();
  })
);
