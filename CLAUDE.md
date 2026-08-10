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

## Running things

```bash
cd job-app-system/api && npm run dev            # API on :4000
cd job-app-system/ui && npm run dev             # UI on :5173
cd job-app-system/scrapers && npx tsx src/runDiscovery.ts   # one discovery run
cd job-app-system/api && npm run import-documents           # (re)import Resumes/ + Cover Letters/
```

## Skills

- `add-job-source` — add a new org/board to the discovery pipeline.
- `run-discovery` — run the scraper pipeline + generate the notification summary.
- `tailor-application` — draft a tailored resume/cover letter for a specific application.

## Scheduling

A macOS `cron` entry (not a Claude Code cron/routine — those can't reach localhost or local files)
runs `job-app-system/scripts/daily-discovery.sh` daily at 8am. If it seems to have stopped firing,
check that `cron` has Full Disk Access in System Settings → Privacy & Security, and that the Mac
was awake at run time — cron does not run on a sleeping machine.
