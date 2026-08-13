import { Router } from "express";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import {
  createAnswerSnippetSchema,
  updateAnswerSnippetSchema,
  createAnswerOverrideSchema,
  updateAnswerOverrideSchema,
} from "../validation.js";

export const answersRouter = Router();

// --- AnswerSnippet CRUD ---

answersRouter.get(
  "/snippets",
  asyncHandler(async (req, res) => {
    const { category } = req.query;
    const snippets = await prisma.answerSnippet.findMany({
      where: typeof category === "string" ? { category } : undefined,
      orderBy: { createdAt: "desc" },
    });
    res.json(snippets);
  })
);

answersRouter.get(
  "/snippets/:id",
  asyncHandler(async (req, res) => {
    const snippet = await prisma.answerSnippet.findUnique({ where: { id: req.params.id } });
    if (!snippet) throw new HttpError(404, "Answer snippet not found");
    res.json(snippet);
  })
);

answersRouter.post(
  "/snippets",
  asyncHandler(async (req, res) => {
    const data = createAnswerSnippetSchema.parse(req.body);
    const snippet = await prisma.answerSnippet.create({ data });
    res.status(201).json(snippet);
  })
);

answersRouter.patch(
  "/snippets/:id",
  asyncHandler(async (req, res) => {
    const data = updateAnswerSnippetSchema.parse(req.body);
    const existing = await prisma.answerSnippet.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Answer snippet not found");
    const snippet = await prisma.answerSnippet.update({ where: { id: req.params.id }, data });
    res.json(snippet);
  })
);

answersRouter.delete(
  "/snippets/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.answerSnippet.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Answer snippet not found");
    await prisma.answerSnippet.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);

// --- AnswerOverride CRUD ---

answersRouter.get(
  "/overrides",
  asyncHandler(async (req, res) => {
    const { applicationId } = req.query;
    const overrides = await prisma.answerOverride.findMany({
      where: typeof applicationId === "string" ? { applicationId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    res.json(overrides);
  })
);

answersRouter.post(
  "/overrides",
  asyncHandler(async (req, res) => {
    const data = createAnswerOverrideSchema.parse(req.body);
    const override = await prisma.answerOverride.upsert({
      where: {
        applicationId_questionKey: {
          applicationId: data.applicationId,
          questionKey: data.questionKey,
        },
      },
      update: { answer: data.answer, snippetId: data.snippetId ?? null },
      create: data,
    });
    res.status(201).json(override);
  })
);

answersRouter.patch(
  "/overrides/:id",
  asyncHandler(async (req, res) => {
    const data = updateAnswerOverrideSchema.parse(req.body);
    const existing = await prisma.answerOverride.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Answer override not found");
    const override = await prisma.answerOverride.update({ where: { id: req.params.id }, data });
    res.json(override);
  })
);

answersRouter.delete(
  "/overrides/:id",
  asyncHandler(async (req, res) => {
    const existing = await prisma.answerOverride.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new HttpError(404, "Answer override not found");
    await prisma.answerOverride.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
