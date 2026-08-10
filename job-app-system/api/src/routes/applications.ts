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

applicationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateApplicationSchema.parse(req.body);
    const application = await prisma.application
      .update({
        where: { id: req.params.id },
        data: {
          ...data,
          appliedAt: data.appliedAt ? new Date(data.appliedAt) : undefined,
        },
      })
      .catch(() => {
        throw new HttpError(404, "Application not found");
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
