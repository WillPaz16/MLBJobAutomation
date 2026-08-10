# Job Application System

Personal automation for tracking and applying to baseball ops/analytics/R&D roles and general
data science jobs. Lives in `job-app-system/`. Local-first: SQLite + a local Express API + a
React UI, all running on this machine — nothing is deployed anywhere.

## Layout

- `job-app-system/api/` — Express API + Prisma/SQLite (`api/data/jobs.db`). Also owns the daily
  scheduler (`api/src/scheduler.ts`) and db backups (`api/src/backup.ts`) — see "Scheduling" below.
- `job-app-system/scrapers/` — source adapters (Greenhouse, Lever, Workday, ADP, UKG, generic team-page) + `runDiscovery.ts`.
- `job-app-system/ui/` — React (Vite) app, proxies `/api` to :4000.
- `job-app-system/package.json` — root-level only script is `npm run dev`, which boots api+ui
  together via `concurrently`. `scrapers/` is invoked by the scheduler, not part of this.
- `job-app-system/ecosystem.config.cjs` — pm2 config; supervises the API so it restarts on crash.

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
- **MLB coverage is 16/30 teams via scraping, six platforms deep** — Greenhouse, Lever, Workday,
  ADP (Workforce Now), and UKG Pro Recruiting (aka UltiPro; hosts vary — `recruiting.ultipro.com`,
  `recruiting2.ultipro.com`, `<org>.rec.pro.ukg.net` are all the same platform/API shape). The
  remaining 14 teams sit behind Teamwork Online or a closed single-employer ATS (Paycor, aaimtrack,
  SAP SuccessFactors, Hireology) with no public JSON API — see the dead-end comment in
  `sources.config.ts` for exactly which team is on which platform. **Don't trust an mlb.com team
  page alone to say a team is Teamwork-Online-only** — four teams (Yankees, Dodgers, Pirates,
  Rockies) were previously miscategorized as dead ends because the research only checked the
  mlb.com career page instead of following the actual "Apply Now" redirect, which goes to the
  team's real ATS. When re-checking a "dead end," click through to the real apply flow, not just
  the landing page. The honest way to close the remaining gap is the manual flow
  (`POST /api/postings/manual`, "Add posting manually" on Discovery), not more scraping attempts —
  it creates a `Source` row of `type: "manual"` per organization (`manual:<org>`) so manual entries
  still group/attribute like scraped ones, and dedupes on a sha256 hash of the URL via the same
  `sourceId`+`externalId` unique constraint everything else uses.
- **`categorize()` takes an optional third `description` argument** — adapters that get a
  description/summary field for free from their source API (currently only `ukg.ts`, via
  `BriefDescription`) should pass it through; title+org alone missed real cases (e.g. a UKG
  posting titled "Junior Product Designer" whose description said it was on the Dodgers'
  Baseball R&D team). This only affects newly-ingested postings — existing rows aren't
  retroactively recategorized when an adapter's description support improves.
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
cd job-app-system && npm run dev                             # api + ui together, one command
cd job-app-system && npx pm2 start ecosystem.config.cjs       # supervised API (survives crashes)
cd job-app-system && npx pm2 startup                          # one-time, run yourself — survives reboot
cd job-app-system/scrapers && npx tsx src/runDiscovery.ts     # one discovery run, outside the schedule
cd job-app-system/api && npm run import-documents              # (re)import Resumes/ + Cover Letters/
cd job-app-system/api && npm run seed-tailoring                # idempotent — seeds TonePreset defaults
curl -X POST http://localhost:4000/api/scheduler/run-now       # trigger the daily job on demand
npm test                                                       # in api/, scrapers/, or ui/ — vitest
```

## Skills

- `add-job-source` — add a new org/board to the discovery pipeline.
- `run-discovery` — run the scraper pipeline + generate the notification summary.
- `tailor-application` — draft a tailored resume/cover letter for a specific application, using
  the `ResumeBullet`/`TonePreset`/`OrgProfile` framework via the API (not raw `sqlite3`/`tsx -e`).

## Scheduling, backups, and process supervision

- **Scheduling lives inside the API process** (`api/src/scheduler.ts`, via `node-cron`), not
  macOS `cron` anymore — the old `job-app-system/scripts/daily-discovery.sh` and its crontab
  entry were removed once this replaced them. The schedule (default 8am) runs as long as the
  API process is up, which is what pm2 (below) is for.
- **On failure, the scheduler writes a `NotificationLog` row** starting with `⚠️` for whichever
  step failed (backup, scrape, or summary) — the Discovery page's banner reads the most recent
  entry, so a failure is visible next time the app is opened, not just buried in a log file.
- **`api/src/scheduler.ts` spawns the scraper as a child process with an explicit absolute
  `DATABASE_URL` override.** Without this, the API's own `.env`-loaded `DATABASE_URL` (a path
  relative to `api/prisma/`) leaks into the child process's environment and resolves to the
  wrong file under `scrapers/prisma/` instead of the real `api/data/jobs.db` — this shipped
  once as a real bug, caught by actually running the scheduler end-to-end, not by review.
- **Backups** (`api/src/backup.ts`) run before every scheduled discovery — a timestamped copy of
  `jobs.db` into `api/data/backups/`, keeping the most recent 14. `backupDatabase()` takes an
  optional `dataDir` argument specifically so tests can point it at a temp directory — never call
  it against the real `api/data` path from a test.
- **Process supervision is pm2**, not a Claude Code cron/routine (those can't reach localhost or
  local files). `pm2 start ecosystem.config.cjs` keeps the API running and restarts it on crash;
  `pm2 startup` (a one-time command Will runs himself, since it modifies system launchd config)
  makes it survive a reboot.
- To trigger the scheduled job outside its normal 8am time (e.g. for testing), hit
  `POST /api/scheduler/run-now` — it runs the exact same function the cron trigger calls.

## MCP tooling

`.mcp.json` at the repo root configures two project-scoped MCP servers (Claude will prompt to
approve them on first use in a session):
- **Context7** — fetches current, version-specific docs for a library instead of relying on
  training-data knowledge. Worth reaching for on this project specifically: at least two real
  bugs this session came from stale assumptions about a library's API (shadcn's Base UI using
  `render={}` instead of Radix's `asChild`, `onClick` instead of `onSelect` on menu items) —
  checking current docs first would likely have caught both before they shipped.
- **Serena** — semantic code navigation/editing via language-server symbol lookups instead of
  grep. More useful as this codebase grows; modest payoff at its current size (a few dozen files
  across three packages), but cheap to have available.
- Serena requires `uv`/`uvx` (installed via `brew install uv` this session); Context7 needs only
  `npx`, already available. Neither requires an API key for basic use.
