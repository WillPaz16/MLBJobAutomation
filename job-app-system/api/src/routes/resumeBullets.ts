import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { createResumeBulletSchema, updateResumeBulletSchema } from "../validation.js";

export const resumeBulletsRouter = Router();

resumeBulletsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { category, isActive } = req.query;
    const bullets = await prisma.resumeBullet.findMany({
      where: {
        category: category ? (category as string) : undefined,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
      },
    });
    res.json(bullets);
  })
);

resumeBulletsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createResumeBulletSchema.parse(req.body);
    const bullet = await prisma.resumeBullet.create({ data: { ...data, isActive: data.isActive ?? true } });
    res.status(201).json(bullet);
  })
);

resumeBulletsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateResumeBulletSchema.parse(req.body);
    const bullet = await prisma.resumeBullet.update({ where: { id: req.params.id }, data }).catch(() => {
      throw new HttpError(404, "Resume bullet not found");
    });
    res.json(bullet);
  })
);

resumeBulletsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.resumeBullet.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Resume bullet not found");
    });
    res.status(204).end();
  })
);
