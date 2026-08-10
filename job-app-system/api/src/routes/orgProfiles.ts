import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError, rethrowUniqueConstraint } from "../asyncHandler.js";
import { createOrgProfileSchema, updateOrgProfileSchema } from "../validation.js";

export const orgProfilesRouter = Router();

orgProfilesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.orgProfile.findMany({ include: { preferredTone: true } }));
  })
);

orgProfilesRouter.get(
  "/:organizationName",
  asyncHandler(async (req, res) => {
    const profile = await prisma.orgProfile.findUnique({
      where: { organizationName: req.params.organizationName },
      include: { preferredTone: true },
    });
    if (!profile) throw new HttpError(404, "Org profile not found");
    res.json(profile);
  })
);

orgProfilesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createOrgProfileSchema.parse(req.body);
    const profile = await prisma.orgProfile
      .create({ data })
      .catch(rethrowUniqueConstraint("An org profile for this organization already exists"));
    res.status(201).json(profile);
  })
);

orgProfilesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateOrgProfileSchema.parse(req.body);
    const profile = await prisma.orgProfile.update({ where: { id: req.params.id }, data }).catch(() => {
      throw new HttpError(404, "Org profile not found");
    });
    res.json(profile);
  })
);

orgProfilesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.orgProfile.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Org profile not found");
    });
    res.status(204).end();
  })
);
