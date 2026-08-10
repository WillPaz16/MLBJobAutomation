# Job Application System

Personal automation for tracking and applying to baseball ops/analytics/R&D roles and general
data science jobs. Lives in `job-app-system/`. Local-first: SQLite + a local Express API + a
React UI, all running on this machine — nothing is deployed anywhere.

## Layout

- `job-app-system/api/` — Express API + Prisma/SQLite (`api/data/jobs.db`). `npm run dev` to serve on :4000.
- `job-app-system/scrapers/` — source adapters (Greenhouse, Lever, Workday, generic team-page) + `runDiscovery.ts`.
- `job-app-system/ui/` — React (Vite) app. `npm run dev` to serve on :5173, proxies `/api` to :4000.
- `job-app-system/scripts/daily-discovery.sh` — what the cron job runs; logs to `daily-discovery.log`.

## Conventions

- **Prisma + SQLite quirk**: relative `url` values in `schema.prisma` resolve relative to the
  `prisma/` directory the schema file lives in, NOT the package root or cwd. Both `api/prisma/schema.prisma`
  and `scrapers/prisma/schema.prisma` point at the same `api/data/jobs.db` file — keep their relative
  paths (`../data/jobs.db` and `../../api/data/jobs.db` respectively) in sync if either file moves.
- **Enums are plain strings**, not Prisma enums — SQLite has no enum support in Prisma. Valid
  `Posting.category` values and `Application.stage` values are documented as a comment at the top
  of `schema.prisma`. Validate against that list at the API layer, not the DB layer.
- **Adapters are config-driven.** Adding a new job source should touch `sources.config.ts`, not
  adapter code — see the `add-job-source` skill. Every adapter implements the same `Adapter`
  interface (`src/types.ts`) and returns `NormalizedPosting[]`; dedup happens once, centrally, in
  `ingest.ts` (keyed on `sourceId` + `externalId`), so adapters never need their own dedup logic.
- **Never build scraping that defeats bot detection.** Teamwork Online (the main MLB/MiLB job
  aggregator) sits behind Cloudflare and hangs/blocks headless requests — this is intentional on
  their end and we don't route around it. Prefer hitting an org's underlying JSON API directly
  (Greenhouse/Lever/Workday all expose one) over scraping rendered HTML; only fall back to the
  generic Playwright team-page adapter when no such API exists, and only against sites that don't
  require solving a challenge to load.
- **No autonomous submission.** The system surfaces postings and drafts; a human always approves
  before anything is applied to. Don't add code paths that submit applications automatically.
- **API validation lives in `api/src/validation.ts`** (zod schemas for `Posting.category` /
  `Application.stage` / document creation / pagination) — import from there rather than
  redefining the valid-value lists inline. Routes are wrapped in `asyncHandler` (`api/src/
  asyncHandler.ts`) so thrown/rejected errors reach the centralized error middleware in
  `index.ts` and come back as JSON, not Express's default HTML error page.
- **The UI's shadcn/ui setup uses Base UI, not Radix**, despite `shadcn` being the CLI/registry
  name — check a generated component's source before assuming Radix conventions. Concretely:
  compose with the `render={<Element />}` prop instead of `asChild` + a child element, and menu
  items fire `onClick`, not Radix's `onSelect` (using `onSelect` silently no-ops — this exact
  bug shipped once and was only caught by clicking through the UI, not by typecheck).
- **Dark mode is class-based** (`.dark` on `<html>`), set via `main.tsx` mirroring
  `prefers-color-scheme` — there's no in-app toggle yet, so don't assume `dark:` Tailwind
  classes alone are sufficient without that class-sync effect in place.
- **Test databases**: each package with tests (`api`, `scrapers`) points `DATABASE_URL` at a
  throwaway `prisma/test.db` (via `.env` + a test setup file), migrated fresh per run and deleted
  after. `scrapers/prisma` has no `migrations/` directory (it only ever shared `api`'s already-
  migrated DB) — its test setup uses `prisma db push`, not `migrate deploy`, for that reason.
  Never point a test DATABASE_URL at the real `data/jobs.db`.
- **`sources.config.ts` entries are curl-verified, not guessed.** Every org currently in that file
  was confirmed with a live request against its actual API before being added (see the
  `add-job-source` skill). A trailing comment in that file lists teams confirmed to have no
  scrapable public API, so future sessions don't re-research the same dead ends.
- **MLB coverage caps at ~12/30 teams via scraping — this is expected, not a gap to keep chasing.**
  18 teams sit behind Teamwork Online or a closed single-employer ATS (UKG, Paycor, aaimtrack,
  SAP SuccessFactors, Hireology) with no public JSON API — see the dead-end comment in
  `sources.config.ts` for exactly which team is on which platform. The honest way to reach 30/30
  in the tracker is the manual flow (`POST /api/postings/manual`, "Add posting manually" on
  Discovery), not more scraping attempts — it creates a `Source` row of `type: "manual"` per
  organization (`manual:<org>`) so manual entries still group/attribute like scraped ones, and
  dedupes on a sha256 hash of the URL via the same `sourceId`+`externalId` unique constraint
  everything else uses.
- **`Application.order`** is an integer position within its stage column, maintained by the UI
  (Pipeline.tsx) on every drag/stage-move — always re-sequence ALL affected applications in both
  the source and destination column (not just the moved one) so `order` values stay contiguous
  per stage; a gap or duplicate silently breaks sort order for everyone else in that column.
- **Tailoring framework** (`ResumeBullet`, `TonePreset`, `OrgProfile` models + their CRUD routes)
  is a data model only — there's no UI for managing these yet, and generation is still a skill
  (`tailor-application`), not an in-app button. Don't build an in-app "generate" button without
  discussing scope first; that was explicitly deferred, not forgotten.
- **Semantic/embedding-based job matching is deferred, not built.** Postgres/pgvector was
  evaluated and explicitly rejected — this system is nowhere near the data volume where a vector
  database would matter, brute-force cosine similarity in SQLite would be plenty if the feature
  is ever built. It's deferred because a paid embeddings API isn't worth the recurring cost for
  what's currently a convenience feature. If revisited, default to a **local** embedding model
  (e.g. Ollama) before reaching for a paid API — that was the stated preference.
- **LinkedIn/Indeed scraping is explicitly out of scope**, same reasoning as Teamwork Online —
  both sit behind bot detection we don't build around. The `Adapter`/`sources.config.ts` pattern
  already generalizes to any Greenhouse/Lever/Workday employer with zero structural changes;
  non-baseball expansion should stay within that pattern (verified-curl method) or use LinkedIn's/
  Indeed's official partner APIs (a distinct integration requiring applying for access) — never
  headless-browser scraping against either site.
- **dnd-kit drag interactions are difficult to verify via automated browser tools** in this
  environment — synthetic pointer events and single-jump drags consistently fail to trigger
  dnd-kit's `PointerSensor` (observed repeatedly across sessions, not specific to one component).
  When verifying drag-and-drop changes, confirm the underlying persistence logic through a
  non-drag path that exercises the same code (e.g. Pipeline's "Move to stage" dropdown) rather
  than concluding the feature is broken from a failed automated drag alone.

## Running things

```bash
cd job-app-system/api && npm run dev            # API on :4000
cd job-app-system/ui && npm run dev             # UI on :5173
cd job-app-system/scrapers && npx tsx src/runDiscovery.ts   # one discovery run
cd job-app-system/api && npm run import-documents           # (re)import Resumes/ + Cover Letters/
npm test                                                     # in api/, scrapers/, or ui/ — vitest
```

## Skills

- `add-job-source` — add a new org/board to the discovery pipeline.
- `run-discovery` — run the scraper pipeline + generate the notification summary.
- `tailor-application` — draft a tailored resume/cover letter for a specific application, using
  the `ResumeBullet`/`TonePreset`/`OrgProfile` framework via the API (not raw `sqlite3`/`tsx -e`).

## Scheduling

A macOS `cron` entry (not a Claude Code cron/routine — those can't reach localhost or local files)
runs `job-app-system/scripts/daily-discovery.sh` daily at 8am. If it seems to have stopped firing,
check that `cron` has Full Disk Access in System Settings → Privacy & Security, and that the Mac
was awake at run time — cron does not run on a sleeping machine.
