import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError, rethrowUniqueConstraint } from "../asyncHandler.js";
import { createTonePresetSchema, updateTonePresetSchema } from "../validation.js";

export const tonePresetsRouter = Router();

tonePresetsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.tonePreset.findMany());
  })
);

tonePresetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = createTonePresetSchema.parse(req.body);
    const preset = await prisma.tonePreset
      .create({ data: { ...data, isDefault: data.isDefault ?? false } })
      .catch(rethrowUniqueConstraint("A tone preset with this name already exists"));
    res.status(201).json(preset);
  })
);

tonePresetsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateTonePresetSchema.parse(req.body);
    const preset = await prisma.tonePreset.update({ where: { id: req.params.id }, data }).catch(() => {
      throw new HttpError(404, "Tone preset not found");
    });
    res.json(preset);
  })
);

tonePresetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.tonePreset.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Tone preset not found");
    });
    res.status(204).end();
  })
);
