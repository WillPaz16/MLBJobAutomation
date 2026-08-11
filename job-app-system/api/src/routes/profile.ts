import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler } from "../asyncHandler.js";
import { putCandidateProfileSchema } from "../validation.js";

export const profileRouter = Router();

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
    const profile = await prisma.candidateProfile.upsert({
      where: { id: "profile" },
      update: data,
      create: { id: "profile", ...data },
    });
    res.json(profile);
  })
);
