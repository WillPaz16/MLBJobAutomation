import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import { paginationSchema, updateApplicationSchema, reorderApplicationsSchema } from "../validation.js";
import { resolveTemplate, type TemplateContext } from "../answerTemplate.js";
import { generateApplyAssistScript } from "../applyAssist/generateScript.js";
import { isApplicationStalled, getLastActivityAt } from "../applicationStaleness.js";

export const applicationsRouter = Router();

// Shared by both prep-context's `resolvedAnswers` and apply-pack — resolves every active
// AnswerSnippet against this application's context (org/role/orgNotes), substituting a matching
// AnswerOverride's full text in place of the snippet's template when one exists for this specific
// application, plus any standalone override (no linked snippet) as its own entry. Each entry
// reports its own `unresolved` placeholders — never silently blanked (see answerTemplate.ts).
async function computeResolvedAnswers(applicationId: string, context: TemplateContext) {
  const [snippets, overrides] = await Promise.all([
    prisma.answerSnippet.findMany({ where: { isActive: true } }),
    prisma.answerOverride.findMany({ where: { applicationId } }),
  ]);

  const overrideBySnippetId = new Map(
    overrides.filter((o) => o.snippetId).map((o) => [o.snippetId as string, o])
  );
  const usedOverrideIds = new Set<string>();

  type ResolvedAnswer = {
    snippetId: string | null;
    category: string | null;
    question: string | null;
    questionKey: string | null;
    source: "snippet" | "override";
    text: string;
    unresolved: string[];
  };

  const resolvedAnswers: ResolvedAnswer[] = snippets.map((snippet) => {
    const override = overrideBySnippetId.get(snippet.id);
    if (override) {
      usedOverrideIds.add(override.id);
      const { text, unresolved } = resolveTemplate(override.answer, context);
      return {
        snippetId: snippet.id,
        category: snippet.category,
        question: snippet.question,
        questionKey: override.questionKey,
        source: "override" as const,
        text,
        unresolved,
      };
    }
    const { text, unresolved } = resolveTemplate(snippet.template, context);
    return {
      snippetId: snippet.id,
      category: snippet.category,
      question: snippet.question,
      questionKey: null as string | null,
      source: "snippet" as const,
      text,
      unresolved,
    };
  });

  // Standalone overrides with no matching (or no) snippet link still need to surface.
  for (const override of overrides) {
    if (usedOverrideIds.has(override.id)) continue;
    const { text, unresolved } = resolveTemplate(override.answer, context);
    resolvedAnswers.push({
      snippetId: override.snippetId,
      category: null,
      question: null,
      questionKey: override.questionKey,
      source: "override" as const,
      text,
      unresolved,
    });
  }

  return resolvedAnswers;
}

applicationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const { take, skip } = paginationSchema.parse(req.query);
    const applications = await prisma.application.findMany({
      include: {
        posting: { include: { source: true } },
        resumeDoc: true,
        coverDoc: true,
        stageEvents: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
      take,
      skip,
    });
    // isStalled/lastActivityAt are computed here, not stored columns — stageEvents itself is
    // stripped back off the response (kept light, same discipline as GET /api/postings' payload
    // size concerns) rather than shipping the full stage-event array to every caller.
    res.json(
      applications.map((a) => {
        const { stageEvents, ...application } = a;
        return { ...application, isStalled: isApplicationStalled(a), lastActivityAt: getLastActivityAt(a) };
      })
    );
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

    // v8 Phase 4: resolved answer-library text only — NEVER identity PII. This response feeds
    // the tailor-application skill's prompts; a DOB/address/EEO field has no business in a
    // cover-letter drafting context. PII lives only behind GET /:id/apply-pack below.
    const resolvedAnswers = await computeResolvedAnswers(application.id, {
      org: application.posting.organization,
      role: application.posting.title,
      orgNotes: orgProfile?.notes ?? null,
    });

    res.json({ application, orgProfile, tonePreset, resumeBullets, resolvedAnswers });
  })
);

// The ONLY endpoint that returns ApplicantIdentity PII — this is exactly what the Phase 0 CORS
// origin-allowlist was built to protect. Feeds Phase 5/6's apply-assist UI/helper (not built
// here). Includes posting + application + documents + resolved answers alongside identity so a
// future consumer has everything needed for one apply-assist pass in one call.
applicationsRouter.get(
  "/:id/apply-pack",
  asyncHandler(async (req, res) => {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { posting: true, resumeDoc: true, coverDoc: true },
    });
    if (!application) throw new HttpError(404, "Application not found");

    const [identity, orgProfile] = await Promise.all([
      prisma.applicantIdentity.findUnique({
        where: { id: "identity" },
        include: { education: true },
      }),
      prisma.orgProfile.findUnique({ where: { organizationName: application.posting.organization } }),
    ]);

    const resolvedAnswers = await computeResolvedAnswers(application.id, {
      org: application.posting.organization,
      role: application.posting.title,
      orgNotes: orgProfile?.notes ?? null,
    });

    res.json({ application, identity, resolvedAnswers });
  })
);

// v8 Phase 6 — serves a generated, self-contained userscript that inlines THIS application's
// apply-pack data (identity + resolved answers) at request time, so the running script never
// calls back to localhost (or anywhere) at runtime. Same PII boundary as apply-pack above: this
// route is the only other place identity data leaves the API, and only into a file the user
// explicitly downloads/installs into their own userscript manager. See
// api/src/applyAssist/generateScript.ts for the full guard rationale (no click/submit calls,
// sensitive-field skipping, never-auto-runs, never-overwrites, undo, on-page summary).
applicationsRouter.get(
  "/:id/apply-assist-script",
  asyncHandler(async (req, res) => {
    const application = await prisma.application.findUnique({
      where: { id: req.params.id },
      include: { posting: true },
    });
    if (!application) throw new HttpError(404, "Application not found");

    const [identity, orgProfile] = await Promise.all([
      prisma.applicantIdentity.findUnique({
        where: { id: "identity" },
        include: { education: true },
      }),
      prisma.orgProfile.findUnique({ where: { organizationName: application.posting.organization } }),
    ]);

    const resolvedAnswers = await computeResolvedAnswers(application.id, {
      org: application.posting.organization,
      role: application.posting.title,
      orgNotes: orgProfile?.notes ?? null,
    });

    const script = generateApplyAssistScript({
      applicationId: application.id,
      organization: application.posting.organization,
      title: application.posting.title,
      postingUrl: application.posting.url ?? null,
      identity: identity as unknown as Record<string, unknown> | null,
      resolvedAnswers: resolvedAnswers.map((a) => ({
        question: a.question,
        questionKey: a.questionKey,
        text: a.text,
      })),
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="apply-assist-${application.id}.user.js"`);
    res.send(script);
  })
);

// Extracted so both the single-row PATCH below and the batch /reorder endpoint reproduce the
// exact same two side effects on a real stage change: an ApplicationStageEvent row, and stamping
// appliedAt (only if not already set) on first entry to APPLIED. Must run inside the caller's own
// transaction (a `tx`, not the bare `prisma` client) so a batch reorder either writes every row's
// side effects or none of them.
async function applyApplicationUpdate(
  tx: Prisma.TransactionClient,
  existing: { id: string; stage: string; appliedAt: Date | null },
  data: { stage?: string; order?: number; resumeDocId?: string | null; coverDocId?: string | null; notes?: string; appliedAt?: string }
) {
  const stageChanged = data.stage !== undefined && data.stage !== existing.stage;

  const updated = await tx.application.update({
    where: { id: existing.id },
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
}

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

    const application = await prisma.$transaction(async (tx) => applyApplicationUpdate(tx, existing, data));

    res.json(application);
  })
);

// v9 Phase 3 — batch persistence for Pipeline's drag/"Move to stage" actions. Replaces N
// independent PATCHes (fired via Promise.all from the client) with one prisma.$transaction, so a
// partial failure can't leave the server holding a subset of a reorder that the client then
// reverts locally. Every entry whose stage actually changes gets the exact same
// ApplicationStageEvent + appliedAt treatment as the single-row PATCH above, via the shared
// applyApplicationUpdate helper — otherwise dragging a card into Applied would silently stop
// recording history for the batch path.
applicationsRouter.post(
  "/reorder",
  asyncHandler(async (req, res) => {
    const { updates } = reorderApplicationsSchema.parse(req.body);

    const ids = updates.map((u) => u.id);
    const existingRows = await prisma.application.findMany({ where: { id: { in: ids } } });
    if (existingRows.length !== ids.length) {
      throw new HttpError(400, "One or more applications in the batch do not exist");
    }
    const existingById = new Map(existingRows.map((a) => [a.id, a]));

    const applications = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const update of updates) {
        const existing = existingById.get(update.id)!;
        results.push(
          await applyApplicationUpdate(tx, existing, { stage: update.stage, order: update.order })
        );
      }
      return results;
    });

    res.json(applications);
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
