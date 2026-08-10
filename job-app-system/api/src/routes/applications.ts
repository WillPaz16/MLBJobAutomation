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
