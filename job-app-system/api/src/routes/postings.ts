import { Router } from "express";
import { createHash } from "crypto";
import { prisma } from "../db.js";
import { asyncHandler, HttpError } from "../asyncHandler.js";
import {
  createManualPostingSchema,
  paginationSchema,
  postingsDiscoveredAfterSchema,
  updatePostingSchema,
} from "../validation.js";
import { computeFitScore, fitTier } from "../fitScore.js";

export const postingsRouter = Router();

// posting rows carry more fields than FitScorePosting needs — this keeps computeFitScore's
// signature narrow/pure while still accepting the richer Prisma result shape.
function withRawFitScore<T extends { title: string; organization: string; category: string; location: string | null; description: string | null }>(
  posting: T,
  profile: {
    skills: string;
    coreSkills: string | null;
    preferredCategories: string | null;
    locationKeywords: string | null;
    excludeKeywords: string | null;
  } | null
): T & { fitScoreRaw?: number; fitTier?: string; matchedSkills?: string[]; reasons?: unknown[]; evidence?: unknown[] } {
  if (!profile) return posting;
  const { score, tier, matchedSkills, reasons, evidence } = computeFitScore(posting, profile);
  return { ...posting, fitScoreRaw: score, fitTier: tier, matchedSkills, reasons, evidence };
}

// Percentile-rank normalization within a cohort: each posting's raw score is mapped to the
// percentage of the cohort it scores >= (0-100). Computed once across the FULL cohort (not a
// single page) so percentiles stay meaningful across pages of the same request.
function percentileRank(sortedAsc: number[], value: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return 100;
  // Count of values <= this one, minus itself, gives rank among the rest.
  let countBelowOrEqual = 0;
  for (const v of sortedAsc) {
    if (v <= value) countBelowOrEqual++;
  }
  return Math.round((countBelowOrEqual / sortedAsc.length) * 100);
}

function withNormalizedFitScore<T extends { fitScoreRaw?: number }>(
  posting: T,
  rawScoresSortedAsc: number[]
): T & { fitScore?: number } {
  if (posting.fitScoreRaw === undefined) return { ...posting, fitScore: undefined };
  const percentile = percentileRank(rawScoresSortedAsc, posting.fitScoreRaw);
  // fitTier thresholds apply to the NORMALIZED (percentile) score, not the raw formula output —
  // that's what makes "Strong" reachable in every tab instead of only the highest-raw-scoring one.
  return { ...posting, fitScore: percentile, fitTier: fitTier(percentile) };
}

// Tokenizes a free-text search query into an AND-of-ORs, one clause per term. A quoted
// "multi word phrase" stays a single term; a leading `-` (outside quotes, or on a quoted phrase)
// negates that term. Bounded to 8 terms so a pathological query can't build an unbounded `AND`
// array. Deliberately NOT FTS5 (see CLAUDE.md-adjacent plan notes) — at 587 rows a LIKE scan per
// term is dwarfed by the full-cohort fetch + computeFitScore's own regex pass that already runs
// per request, and this keeps the query a composable typed Prisma `where` instead of a
// `$queryRaw` id-list round-trip.
function parseSearchTokens(q: string): { term: string; negate: boolean }[] {
  const tokens: { term: string; negate: boolean }[] = [];
  const re = /(-)?"([^"]+)"|(-)?(\S+)/g;
  let match: RegExpExecArray | null;
  while (tokens.length < 8 && (match = re.exec(q)) !== null) {
    const negate = Boolean(match[1] ?? match[3]);
    const term = (match[2] ?? match[4] ?? "").trim();
    if (term) tokens.push({ term, negate });
  }
  return tokens;
}

// Each term matches if it appears (case-insensitive-for-ASCII, per SQLite LIKE) in title,
// organization, OR description — this is the part that fixes both "data scientist" failing to
// match "Scientist, Data" (tokenized instead of one whole-string `contains`) and description never
// being searched at all (previously only title+organization were checked).
function searchTermClause(term: string) {
  return {
    OR: [
      { title: { contains: term } },
      { organization: { contains: term } },
      // `description` is nullable, and SQL three-valued logic means `description LIKE '%x%'` on a
      // NULL description evaluates to NULL, not false — inside a negated (`NOT`) term that NULL
      // poisons the whole OR to NULL (not true), silently excluding every posting with no
      // description at all, matched or not. Explicitly gating on `not: null` first keeps this
      // clause a real boolean for every row.
      { AND: [{ description: { not: null } }, { description: { contains: term } }] },
    ],
  };
}

// Shared null-safe date-field comparator: nulls sort LAST regardless of `asc`/`desc` direction,
// with an `id` tiebreak for stable pagination across requests. Used by both the profile-exists
// (JS-sorted) path and the no-profile path's postedAt sorts below — `postedAt` is nullable
// (~90% null on real data) and discoveredAt_desc/asc go through Prisma's own non-nullable
// orderBy instead, so only the postedAt sorts need this.
function compareNullsLast<T extends { id: string }>(a: T, b: T, field: string, direction: "asc" | "desc"): number {
  const av = (a as any)[field];
  const bv = (b as any)[field];
  if (av === null && bv === null) return a.id.localeCompare(b.id);
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp = +new Date(av) - +new Date(bv);
  const directed = direction === "asc" ? cmp : -cmp;
  return directed !== 0 ? directed : a.id.localeCompare(b.id);
}

const SORT_OPTIONS = {
  discoveredAt_desc: { discoveredAt: "desc" as const },
  discoveredAt_asc: { discoveredAt: "asc" as const },
  postedAt_desc: { postedAt: "desc" as const },
  postedAt_asc: { postedAt: "asc" as const },
};

postingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const {
      category,
      seniority,
      workMode,
      region,
      location,
      remoteOnly,
      q,
      source,
      organization,
      status,
      sort,
      minFit,
      hideDuplicates,
      showDismissed,
      isMlbTeam,
      sourceSection,
      isInternship,
      discoveredAfter,
      excludeInPipeline,
      matchedSkill,
    } = req.query;
    const { take, skip } = paginationSchema.parse(req.query);
    // Validated separately from pagination above: this is the one param here that gets parsed
    // into a real `Date` for a Prisma filter, so a garbage value needs to 400, not 500 (a bad
    // `Date` silently becomes `Invalid Date`, which Prisma would otherwise pass straight through).
    const { discoveredAfter: parsedDiscoveredAfter } = postingsDiscoveredAfterSchema.parse(req.query);

    const statusFilter =
      status === "closed" ? { closedAt: { not: null } } : status === "all" ? {} : { closedAt: null };

    // `minFit` requires the same full-fetch-then-JS-filter treatment as fit_desc sorting (fit
    // score isn't a DB column), but the two are independent/orthogonal: a caller can filter by
    // minFit while sorting by postedAt, or sort by fit_desc with no minFit floor at all.
    const parsedMinFit = typeof minFit === "string" ? Number(minFit) : undefined;
    const hasMinFit = parsedMinFit !== undefined && !Number.isNaN(parsedMinFit);
    const matchedSkillFilter = typeof matchedSkill === "string" && matchedSkill.length > 0 ? matchedSkill.toLowerCase() : undefined;

    const where = {
      category: category ? (category as string) : undefined,
      seniority: seniority ? (seniority as string) : undefined,
      // Exact-match filters on the classifiers in scrapers/src/location.ts, same pattern as
      // `seniority` above. `workMode: "REMOTE"` and the older `remoteOnly` boolean filter below
      // are two independent ways to ask for the same thing — they're kept consistent because
      // classifyWorkMode's REMOTE branch uses the identical `/\bremote\b/i` test that
      // `remoteOnly`'s `location.contains("remote")` performs (and Prisma's SQLite `contains` is
      // case-insensitive by default, confirmed live against real data), so a stored `workMode`
      // can never disagree with what the live substring check would compute.
      workMode: workMode ? (workMode as string) : undefined,
      region: region ? (region as string) : undefined,
      // Matches the existing free-text `location` contains-filter's case sensitivity exactly
      // (Prisma's default `contains` on SQLite is case-INsensitive-for-ASCII, confirmed live
      // against real data — see the `workMode` comment above, which already had this right) —
      // remoteOnly is just another `location`-shaped condition, combined via AND below rather
      // than a duplicate object key.
      source: source ? { type: source as string } : undefined,
      // `discoveredAt` is non-null on 587/587 active postings (unlike `postedAt`, null on ~90%),
      // so this is the recency filter that actually works for every posting, not just the
      // minority with a scraped post date.
      discoveredAt: parsedDiscoveredAfter ? { gte: new Date(parsedDiscoveredAfter) } : undefined,
      // A real `where` clause (not a JS post-filter, unlike matchedSkill below) — it shrinks the
      // cohort at the DB level, same as every other exact-match filter here.
      applications: excludeInPipeline === "true" ? { none: {} } : undefined,
      organization: organization ? (organization as string) : undefined,
      // Exact-match boolean filter, same "true"/"false" string-coercion pattern as
      // hideDuplicates/showDismissed above — Express query params always arrive as strings.
      isMlbTeam: isMlbTeam === "true" ? true : isMlbTeam === "false" ? false : undefined,
      // Exact-match filter, same pattern as `organization` above — sourceSection is free-text
      // (the exact SimplifyJobs section header), not an enum, so no zod schema entry is needed.
      sourceSection: sourceSection ? (sourceSection as string) : undefined,
      // Exact-match boolean filter, same "true"/"false" string-coercion pattern as isMlbTeam
      // above.
      isInternship: isInternship === "true" ? true : isInternship === "false" ? false : undefined,
      dismissedAt: showDismissed === "true" ? undefined : null,
      ...statusFilter,
      AND: [
        ...(typeof q === "string" && q.trim().length > 0
          ? parseSearchTokens(q).map(({ term, negate }) => (negate ? { NOT: searchTermClause(term) } : searchTermClause(term)))
          : []),
        hideDuplicates === "true" ? { OR: [{ possibleDuplicateOfId: null }, { duplicateRejected: true }] } : {},
        location ? { location: { contains: location as string } } : {},
        remoteOnly === "true" ? { location: { contains: "remote" } } : {},
      ],
    };

    const profile = await prisma.candidateProfile.findUnique({ where: { id: "profile" } });

    // Fit score isn't a DB column, so it can't go through Prisma's orderBy/where. Per the v7
    // per-tab-normalization plan, `fitScore` returned to the client is a PERCENTILE rank within
    // the current request's own cohort (whatever `where` already scopes to — typically an
    // isMlbTeam/sourceSection tab, or the whole unscoped set if neither is present). A single
    // page can't be normalized against itself — percentiles across pages would be meaningless —
    // so whenever a profile exists at all, we fetch the FULL matching cohort, compute raw scores,
    // derive percentiles across that whole cohort, THEN filter/sort/paginate. This subsumes what
    // used to be the special-cased sort=fit_desc/minFit-only path; that path is now just "the
    // profile-exists path" unconditionally, since normalization always needs the full cohort
    // regardless of what sort/filter is actually requested.
    if (profile) {
      const allPostings = await prisma.posting.findMany({
        where,
        include: { source: true, applications: true, possibleDuplicateOf: true },
      });
      const rawScored = allPostings.map((p) => withRawFitScore(p, profile));
      const rawScoresSortedAsc = rawScored
        .map((p) => p.fitScoreRaw)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      let scored = rawScored.map((p) => withNormalizedFitScore(p, rawScoresSortedAsc));

      if (hasMinFit) {
        scored = scored.filter((p) => (p.fitScore ?? 0) >= parsedMinFit!);
      }
      // `matchedSkills` comes from computeFitScore, not a DB column, so — like minFit — it has to
      // be applied here in JS, AFTER percentile normalization has already been computed against
      // the full cohort. Narrowing to one skill must never re-rank the surviving rows: their
      // fitScore/fitTier stay exactly what they were computed as above. Deliberately NOT pushed
      // into the Prisma `where` as a `description: { contains: skill }` — that would disagree with
      // countSkillMatches's word-boundary regex (a single-char skill like "r" matching inside
      // "R&D" is exactly what buildSkillRegex's lookahead guards against) and would silently
      // shrink the cohort BEFORE normalization, shifting everyone else's percentile too.
      if (matchedSkillFilter) {
        scored = scored.filter((p) => (p.matchedSkills ?? []).some((s) => s.toLowerCase() === matchedSkillFilter));
      }
      if (sort === "fit_desc") {
        scored.sort(
          (a, b) =>
            (b.fitScore ?? 0) - (a.fitScore ?? 0) ||
            +new Date(b.discoveredAt) - +new Date(a.discoveredAt) ||
            a.id.localeCompare(b.id)
        );
      } else {
        const sortOrder =
          typeof sort === "string" && sort in SORT_OPTIONS ? SORT_OPTIONS[sort as keyof typeof SORT_OPTIONS] : SORT_OPTIONS.discoveredAt_desc;
        const [field, direction] = Object.entries(sortOrder)[0] as [string, "asc" | "desc"];
        // Nulls sort LAST regardless of direction (see compareNullsLast) — the old version fed
        // the null branch into `asc ? cmp : -cmp`, so nulls landed last on asc but FIRST on desc
        // (the bug that made postedAt_desc open with ~526 undated rows). Also gives every non-fit
        // sort an id tiebreak, matching the fit_desc branch above — postings ingested in one batch
        // can share discoveredAt to the millisecond, and with pagination re-sorting+re-slicing a
        // freshly fetched array per request, an unstable order can drop or duplicate rows across
        // page boundaries.
        scored.sort((a, b) => compareNullsLast(a, b, field, direction));
      }
      // X-Total-Count reflects the post-minFit/matchedSkill-filter count, not the unfiltered
      // cohort total, since that's the count that actually matches the request. X-Fit-Cohort-Size
      // is different on purpose: it's the size of the cohort percentiles were computed AGAINST
      // (before minFit/matchedSkill narrow the result), so the UI can explain "ranked against N
      // postings in this view" even when the visible list is much smaller.
      const total = scored.length;
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      const paged = scored.slice(start, end);
      res.set("X-Total-Count", String(total));
      res.set("X-Fit-Cohort-Size", String(allPostings.length));
      res.json(paged);
      return;
    }

    // postedAt is nullable (~90% null on real data) and Prisma/SQLite's default null-ordering
    // puts nulls FIRST on both directions — same bug as the profile-exists path above, just via
    // Prisma's own orderBy instead of a JS comparator. discoveredAt is non-null on every posting,
    // so its two sorts stay on the simple Prisma orderBy+take+skip path; postedAt sorts fetch the
    // full matching set and use the same null-safe JS comparator instead.
    const isPostedAtSort = sort === "postedAt_asc" || sort === "postedAt_desc";
    let postings: Awaited<ReturnType<typeof prisma.posting.findMany>>;
    let total: number;
    if (isPostedAtSort) {
      const direction = sort === "postedAt_asc" ? "asc" : "desc";
      const [all, count] = await Promise.all([
        prisma.posting.findMany({ where, include: { source: true, applications: true, possibleDuplicateOf: true } }),
        prisma.posting.count({ where }),
      ]);
      all.sort((a, b) => compareNullsLast(a, b, "postedAt", direction));
      const start = skip ?? 0;
      const end = take !== undefined ? start + take : undefined;
      postings = all.slice(start, end);
      total = count;
    } else {
      const [rows, count] = await Promise.all([
        prisma.posting.findMany({
          where,
          include: { source: true, applications: true, possibleDuplicateOf: true },
          orderBy:
            typeof sort === "string" && sort in SORT_OPTIONS
              ? SORT_OPTIONS[sort as keyof typeof SORT_OPTIONS]
              : SORT_OPTIONS.discoveredAt_desc,
          take,
          skip,
        }),
        prisma.posting.count({ where }),
      ]);
      postings = rows;
      total = count;
    }
    // Exposed via a header, not the body, so the response stays a bare array — every existing
    // consumer/test asserting on res.body directly keeps working unchanged.
    res.set("X-Total-Count", String(total));
    res.json(postings);
  })
);

// Registered before "/:id" — Express matches path segments in declaration order, and "/:id" would
// otherwise swallow "/organizations" as a literal id value.
postingsRouter.get(
  "/organizations",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.posting.findMany({
      where: { dismissedAt: null },
      select: { organization: true },
      distinct: ["organization"],
      orderBy: { organization: "asc" },
    });
    res.json(rows.map((r) => r.organization));
  })
);

// Registered before "/:id" for the same reason as "/organizations" above.
postingsRouter.get(
  "/facets",
  asyncHandler(async (_req, res) => {
    const [
      seniorityRows,
      workModeRows,
      regionRows,
      mlbTeamTrueCount,
      mlbTeamFalseCount,
      sourceSectionRows,
      internshipTrueCount,
      internshipFalseCount,
      allActiveCount,
      inUseSourceIdRows,
    ] = await Promise.all([
      prisma.posting.findMany({
        where: { seniority: { not: null } },
        select: { seniority: true },
        distinct: ["seniority"],
        orderBy: { seniority: "asc" },
      }),
      prisma.posting.findMany({
        where: { workMode: { not: null } },
        select: { workMode: true },
        distinct: ["workMode"],
        orderBy: { workMode: "asc" },
      }),
      prisma.posting.findMany({
        where: { region: { not: null } },
        select: { region: true },
        distinct: ["region"],
        orderBy: { region: "asc" },
      }),
      // Unlike the distinct-value lists above, these two are rendered directly as user-facing
      // tab-count numbers (Discovery's Baseball/DS-AI-ML/Quant/PM tabs) — an unscoped count would
      // visibly disagree with what the default view actually shows (confirmed live: isMlbTeam=true
      // totalled 204 unscoped vs. 186 once closed/dismissed rows are excluded, a discrepancy a user
      // would immediately notice comparing the tab label to the tab's own contents). Scoped to
      // match the default view exactly: active (closedAt: null) and not dismissed
      // (dismissedAt: null) — the same status="active"/showDismissed="false" defaults the main
      // GET / handler uses.
      prisma.posting.count({ where: { isMlbTeam: true, closedAt: null, dismissedAt: null } }),
      prisma.posting.count({ where: { isMlbTeam: false, closedAt: null, dismissedAt: null } }),
      prisma.posting.groupBy({
        by: ["sourceSection"],
        where: { sourceSection: { not: null }, closedAt: null, dismissedAt: null },
        _count: { sourceSection: true },
      }),
      // Same scope as mlbTeamCounts/sourceSectionCounts above (active, not dismissed) — the
      // isMlbTeam facet-scoping bug (one count using a different scope than its siblings) is a
      // documented past mistake in this file; isInternship's counts deliberately match exactly.
      prisma.posting.count({ where: { isInternship: true, closedAt: null, dismissedAt: null } }),
      prisma.posting.count({ where: { isInternship: false, closedAt: null, dismissedAt: null } }),
      // Unscoped active+undismissed total — makes the 587-vs-547 "40 postings unreachable through
      // any tab" gap legible (mlbTeamCounts.true + sourceSectionCounts' 3 values don't sum to the
      // real total, since 40 active postings match neither isMlbTeam=true nor any of the 3
      // sourceSection values — e.g. a non-baseball org from an adapter that isn't the SimplifyJobs
      // list). Same active/undismissed scope as every other count in this endpoint.
      prisma.posting.count({ where: { closedAt: null, dismissedAt: null } }),
      // Distinct ATS source TYPES actually in use by an active, undismissed posting right now —
      // not every `type` that has ever existed in the Source table (a source can be fully closed
      // out, e.g. a team whose only listing closed), so this only lists platforms a "Source" filter
      // in the UI would actually return non-empty results for.
      prisma.posting.findMany({
        where: { closedAt: null, dismissedAt: null },
        select: { sourceId: true },
        distinct: ["sourceId"],
      }),
    ]);
    const sourceSectionCounts: Record<string, number> = {};
    for (const row of sourceSectionRows) {
      if (row.sourceSection) sourceSectionCounts[row.sourceSection] = row._count.sourceSection;
    }
    const activeSourceRows = await prisma.source.findMany({
      where: { id: { in: inUseSourceIdRows.map((r) => r.sourceId) } },
      select: { type: true },
      distinct: ["type"],
      orderBy: { type: "asc" },
    });
    res.json({
      seniorities: seniorityRows.map((r) => r.seniority),
      workModes: workModeRows.map((r) => r.workMode),
      regions: regionRows.map((r) => r.region),
      mlbTeamCounts: { true: mlbTeamTrueCount, false: mlbTeamFalseCount },
      sourceSectionCounts,
      internshipCounts: { true: internshipTrueCount, false: internshipFalseCount },
      allActiveCount,
      sourceTypes: activeSourceRows.map((r) => r.type),
    });
  })
);

postingsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const [posting, profile] = await Promise.all([
      prisma.posting.findUnique({
        where: { id: req.params.id },
        include: { source: true, applications: true, possibleDuplicateOf: true },
      }),
      prisma.candidateProfile.findUnique({ where: { id: "profile" } }),
    ]);
    if (!posting) throw new HttpError(404, "Posting not found");
    if (!profile) {
      res.json(posting);
      return;
    }
    // Single-posting fetch has no natural "cohort" to normalize against the way the list view
    // does — rather than doing a second full-cohort fetch just to rank one row, we score it
    // against itself: its raw score is also its own 100th-percentile within a cohort of one.
    // This is the simpler of the two reasonable options and matches how the detail view is
    // actually used (showing what the posting itself looks like, not how it ranks against
    // everything else in its tab).
    const scored = withRawFitScore(posting, profile);
    const result = withNormalizedFitScore(scored, scored.fitScoreRaw !== undefined ? [scored.fitScoreRaw] : []);
    res.json(result);
  })
);

postingsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const { dismissedAt, ...rest } = updatePostingSchema.parse(req.body);
    const posting = await prisma.posting
      .update({
        where: { id: req.params.id },
        data: {
          ...rest,
          dismissedAt: dismissedAt === undefined ? undefined : dismissedAt ? new Date(dismissedAt) : null,
        },
      })
      .catch(() => {
        throw new HttpError(404, "Posting not found");
      });
    res.json(posting);
  })
);

postingsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.posting.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "Posting not found");
    });
    res.status(204).end();
  })
);

postingsRouter.post(
  "/manual",
  asyncHandler(async (req, res) => {
    const data = createManualPostingSchema.parse(req.body);
    // One Source per organization for manually-added postings, so they're grouped/attributed
    // like scraped ones instead of all collapsing into a single generic "manual" bucket.
    const sourceName = `manual:${data.organization}`;
    const source = await prisma.source.upsert({
      where: { name: sourceName },
      update: {},
      create: { name: sourceName, type: "manual" },
    });
    // Synthetic externalId from the URL so pasting the same posting twice still dedupes
    // via the existing sourceId+externalId unique constraint — no separate manual-dedup logic.
    const externalId = createHash("sha256").update(data.url).digest("hex");

    // Idempotent: pasting the same URL again just returns the existing posting rather
    // than erroring, matching the scraper's silent-skip dedup behavior in ingest.ts.
    const posting = await prisma.posting.upsert({
      where: { sourceId_externalId: { sourceId: source.id, externalId } },
      update: {},
      create: {
        sourceId: source.id,
        externalId,
        title: data.title,
        organization: data.organization,
        location: data.location,
        category: data.category ?? "OTHER",
        url: data.url,
        description: data.description,
      },
    });
    res.status(201).json(posting);
  })
);

postingsRouter.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const posting = await prisma.posting.findUnique({ where: { id: req.params.id } });
    if (!posting) throw new HttpError(404, "Posting not found");
    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: { postingId: posting.id, stage: "REVIEWING" },
      });
      // Seed event — the second (and only other) write path to ApplicationStageEvent besides
      // the PATCH handler's stage-change branch, so an application's history always starts
      // with a real "how did this get created" row instead of a gap before its first PATCH.
      await tx.applicationStageEvent.create({
        data: { applicationId: created.id, fromStage: null, toStage: created.stage, source: "api" },
      });
      return created;
    });
    res.status(201).json(application);
  })
);
