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
- **Never build scraping that defeats bot detection.** Teamwork Online's own cross-org job search
  sits behind Cloudflare and blocks headless/scripted requests — that's intentional and we don't
  route around it. (Its individual team career pages are a different story — see the MLB coverage
  bullet below for the full nuance on what's actually blocked vs. what just looked blocked.)
  Prefer hitting an org's underlying JSON API directly (Greenhouse/Lever/Workday all expose one)
  over scraping rendered HTML; only fall back to the generic Playwright team-page adapter when no
  such API exists, and only against sites that don't require solving a challenge to load.
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
- **Cross-source duplicate detection lives in `scrapers/src/dedupe.ts`.** The exact
  `sourceId`+`externalId` key in `ingestPostings` only catches the same source posting the same
  job twice — it can't catch the same job posted to two different sources under different IDs and
  slightly different wording (e.g. Royals/Diamondbacks post some roles to both TeamWork Online and
  Dayforce with different title text on each platform). `isLikelyDuplicateTitle` does fuzzy
  token-overlap matching (Jaccard similarity ≥ 0.5, with a minimum-3-shared-meaningful-words floor
  to avoid false-matching short generic titles like "Ticket Sales Associate" vs "Ticket Sales
  Representative"), scoped to postings from the same `organization`. `ingestPostings` runs this as
  a second check after the exact-key lookup fails, before inserting. Tuned against a real observed
  pair, confirmed live: Dayforce's "Coordinator-Community Partnerships and Events-UYA" correctly
  matched TeamWork Online's "Urban Youth Academy – Coordinator, Community Partnerships and Events"
  for the same Royals role, while the org's 3 other Dayforce-only postings (including a Baseball
  R&D analyst role TeamWork Online didn't have) correctly inserted as new.
- **`sources.config.ts` entries are curl-verified, not guessed.** Every org currently in that file
  was confirmed with a live request against its actual API before being added (see the
  `add-job-source` skill). A trailing comment in that file lists teams confirmed to have no
  scrapable public API, so future sessions don't re-research the same dead ends.
- **MLB coverage is 30/30 teams via scraping, eleven platforms deep** — Greenhouse, Lever,
  Workday, ADP (Workforce Now), UKG Pro Recruiting (aka UltiPro; hosts vary —
  `recruiting.ultipro.com`, `recruiting2.ultipro.com`, `<org>.rec.pro.ukg.net` are all the same
  platform/API shape), BambooHR, aaimtrack.com, TeamWork Online (team-specific career pages, plain
  HTTP — see below), Dayforce HCM (Playwright network interception — see below), and the generic
  `teamPageAdapter` (Playwright DOM scraping — covers Brewers/iCIMS, Padres/Hireology, and
  Twins/Paycor, none of which had a JSON API but none had bot protection either). **No dead ends
  remain.** Royals/Diamondbacks post to both TeamWork Online and Dayforce; both sources are wired
  in and cross-source duplicate detection (see below) keeps the same job from showing up twice.
  **Two reversals of earlier wrong conclusions, both worth remembering for any future "this site
  is blocked" claim:**
  (1) **`teamworkonline.ts`**: Marlins/Reds/Royals/Diamondbacks were long assumed blocked because
  TeamWork Online's platform-wide job search sits behind Cloudflare — but each team's own career
  page (`teamworkonline.com/baseball-jobs/<org>/<org>`) is plain server-rendered HTML with a real
  browser `User-Agent` header, no challenge, and a clean schema.org `JobPosting` JSON-LD block per
  listing. Lesson: always try a plain `fetch` with a real browser User-Agent before concluding a
  site needs Playwright or has bot detection — a missing/generic UA can look identical to a real
  block.
  (2) **`dayforce.ts`**: Dayforce's own `POST /api/geo/<tenant>/jobposting/search` API 403s on
  every scripted request, including one replayed from inside the live page's own JS console with
  matching cookies — but that block is specifically against standalone HTTP replay, not against
  browser automation. A genuine Playwright navigation to the candidate portal (real Chromium
  loading the page, same technique as `teamPageAdapter`) reaches that same endpoint and gets a
  normal 200 with the full job list; `dayforce.ts` intercepts that response via
  `page.waitForResponse()` instead of hitting the API directly. This isn't defeating bot
  detection — the site only refuses standalone API calls, and Playwright is doing exactly what a
  real visitor's browser does. Lesson: "blocked" via `curl`/`fetch` doesn't necessarily mean
  blocked for a real browser session — retest with Playwright before writing a JSON API off as
  bot-protected, and only treat it as a genuine dead end if browser automation *also* fails (a
  CAPTCHA/challenge page, or a block on the page load itself, not just a standalone API call).
  Also worth remembering generally: **a team can have more than one legitimate posting source** —
  finding one bot-protected API doesn't mean that's the only source, or even that it's actually
  unusable; check the org's own career page for every outbound apply link, not just the first one
  found, and don't stop at the first blocked attempt. **No JSON API ≠ dead end, "blocked" on one
  page of a platform ≠ blocked on all of it, and "blocked for curl" ≠ "blocked for Playwright."**
  Twelve other teams (Yankees, Dodgers, Pirates, Rockies, Astros, Angels, Nationals, White Sox,
  Rays via ADP/UKG, Blue Jays via BambooHR, Brewers/Padres/Twins via `teamPageAdapter`) were
  previously miscategorized as dead ends because the research only checked the mlb.com career page
  instead of following the actual "Apply Now" redirect. When adding a source: try a plain fetch
  with a real User-Agent first, then look for a JSON API (browser network capture, not
  curl-guessing — client-rendered apps like aaimtrack's Vue SPA don't reveal their API to curl at
  all), then try that same API via genuine Playwright navigation if curl gets blocked, and only
  reach for Playwright DOM-scraping (`teamPageAdapter`) if the page is genuinely client-rendered
  with no extractable API at all. If a team's coverage ever needs closing again for some other
  reason, the manual flow
  (`POST /api/postings/manual`, "Add posting manually" on Discovery) exists for exactly that — it
  creates a `Source` row of `type: "manual"` per organization (`manual:<org>`) so manual entries
  still group/attribute like scraped ones, and dedupes on a sha256 hash of the URL via the same
  `sourceId`+`externalId` unique constraint everything else uses.
- **`categorize()` takes an optional third `description` argument** — adapters that get a
  description/summary field from their source API should pass it through; title+org alone missed
  real cases (e.g. a UKG posting titled "Junior Product Designer" whose description said it was on
  the Dodgers' Baseball R&D team). All adapters now pass it (`greenhouse.ts` requests
  `?content=true`; `lever.ts` uses `descriptionPlain`; `workday.ts` does a per-posting detail fetch
  since the list endpoint doesn't include it — `teamworkonline.ts`/`dayforce.ts`/`ukg.ts` already
  had it). This only affects newly-ingested postings — existing rows aren't retroactively
  recategorized when an adapter's description support improves.
- **`categorize()`'s baseball-org branch has no unconditional default anymore.** It used to fall
  back to `BASEBALL_OPS` whenever a baseball-org posting matched none of the R&D/analytics/ops
  keywords — that miscategorized ushers, ticket sales, security, retail, and grounds-crew roles as
  front-office jobs, burying the real `BASEBALL_OPS` tag under generic team-support postings. It
  now falls through to `OTHER` instead, same as any other posting with no positive department
  signal — no separate exclusion-keyword list needed, `OTHER` already existed for exactly this.
- **When a source has no JSON API but also no bot protection, render + DOM-scrape it — don't
  reverse-engineer its internal API.** `teamPageAdapter.ts` (generic Playwright scraper) exists
  for exactly this. It's the right tool whenever a site is JS-heavy/complex but doesn't actively
  block headless requests (that distinction — heavy JS vs. active bot detection — is the whole
  ballgame; only the latter is off-limits). Some platforms nest the actual listing in a
  same-origin iframe that won't render if navigated to directly (it depends on being embedded in
  the parent page) — `teamPageAdapter`'s optional `frameUrlContains` config searches
  `page.frames()` for the right one instead. Milwaukee Brewers (iCIMS) is the first real usage of
  this — DOM structure inspected live via Playwright rather than curl (curl only sees the
  server-rendered shell, not client-rendered content).
- **`Application.order`** is an integer position within its stage column, maintained by the UI
  (Pipeline.tsx) on every drag/stage-move — always re-sequence ALL affected applications in both
  the source and destination column (not just the moved one) so `order` values stay contiguous
  per stage; a gap or duplicate silently breaks sort order for everyone else in that column.
- **Tailoring framework** (`ResumeBullet`, `TonePreset`, `OrgProfile` models + their CRUD routes)
  is still a data model with no management UI, and drafting is still a skill (`tailor-application`),
  not an in-app "generate" button — that's still deliberately deferred (drafting stays
  human-reviewed prose, not a deterministic matcher). What's new: `GET /api/applications/:id/
  prep-context` (`api/src/routes/applications.ts`) joins posting + application + matched
  `OrgProfile` + resolved `TonePreset` + active `ResumeBullet`s in one call, replacing 4 separate
  curls the skill used to make. The UI's **Prep page** (`ui/src/pages/Prep.tsx`, `/prep`) lists
  `REVIEWING` applications with no resume/cover doc attached yet — the actual "mass applying" time
  save is visibility into that backlog (a "Copy prep prompt" button hands off to the skill), not
  auto-drafting many applications unreviewed. The skill also now adds a short "personalized
  talking points" section per application (3-5 bullets to paste into open-answer fields) —
  deliberately not literal question extraction, since no adapter reliably exposes an application's
  actual questions in parseable form across 5+ ATS shapes.
- **The posting URL is surfaced directly in both Discovery's list rows and Pipeline's Kanban
  cards** (a small `ExternalLink` icon/link using `posting.url`, no schema change — the relation
  already existed) — previously it was one dialog-click deep in Discovery only and completely
  absent from Pipeline, so getting back to the real job page meant re-finding the posting in
  Discovery from scratch.
- **Active/inactive posting tracking** (`Posting.lastSeenAt`/`closedAt`/`missedRuns`,
  `scrapers/src/ingest.ts`). A posting is marked `closedAt` after **2 consecutive** scrape runs of
  its `(sourceId, organization)` fail to find it — not 1, so a single flaky/partial run can't
  wrongly close everything from that org. **This scoping is critical and easy to get wrong**: one
  `Source` row is shared across every org an adapter covers (e.g. all Greenhouse-hosted teams share
  the `"greenhouse"` `Source`), so the closing pass must never compare against `sourceId` alone —
  `ingestPostings` now takes an explicit `organization` argument (not derived from the `postings`
  array, since an org with zero current postings still needs the closing pass to run) so this stays
  correctly scoped per call. A closed posting automatically reopens (`closedAt` cleared,
  `missedRuns` reset) if it reappears in a later run. Surfaced as a `status` filter on
  `GET /api/postings` (`active` default | `closed` | `all`) and a "Closed"/"Posting closed" badge
  in both Discovery and Pipeline — the Pipeline one matters most: it's the signal that you're still
  working an application for a job that's no longer live.
- **Cross-source duplicate suppression was a real bug, now fixed.** `dedupe.ts`'s fuzzy title match
  used to silently skip inserting a posting the moment it looked like a duplicate of an existing
  one from the same org — no record, no way to review, so a genuinely different job could vanish
  before ever being seen. `ingestPostings` now inserts the posting as its own real row and links it
  via `Posting.possibleDuplicateOfId` instead, with a `duplicateRejected` flag the user can set
  (`PATCH /api/postings/:id`) to say "not actually a duplicate, keep separate." Discovery shows a
  "Possible duplicate" badge with a tooltip linking to the matched posting, and a "Hide flagged
  duplicates" checkbox (default on) via the `hideDuplicates` query param — filterable, not forced.
  **When combining this with other `where` filters in `postings.ts`, don't put two conditions under
  the same `OR` key** — they silently clobber each other (later key wins in the object literal);
  use `AND: [...]` to combine independent `OR` blocks, which is what a real bug caught in review
  here and a regression test now guards against.
- **Discovery filtering** includes `status` (see above), `sort` (`discoveredAt`/`postedAt`, asc/
  desc), and `organization` (exact match) as server-side query params on `GET /api/postings`,
  following the same debounced pattern as the pre-existing `category`/`location`/`q` filters. The
  UI's "Team / Company" dropdown is populated from `GET /api/postings/organizations` (distinct,
  sorted, excludes dismissed) rather than a hardcoded list. **Filtering by ATS platform (`source`)
  was tried first and dropped from the UI** — it's still a valid API query param (`source={type}`,
  matches `Source.type`), but it turned out to be the wrong grouping for how the app is actually
  used: Will thinks in terms of which team/company a posting is for, not which ATS happens to host
  it. `postedAt` is nullable and SQLite's default null-ordering applies (no special NULLS LAST
  handling) — a known, accepted minor limitation, not a bug.
- **"Not interested" dismissal is a separate concept from `closedAt`.** `Posting.dismissedAt` is
  user-initiated (a dismiss button in Discovery, with an undo toast and a "Show dismissed" filter
  toggle) and persists even if a later scrape still finds the posting live — it reflects a
  judgment call about the *role*, not the listing's liveness, so it must never be conflated with or
  overwritten by the scraper's active/inactive tracking. Excluded from `GET /api/postings` by
  default (`showDismissed=true` to include).
- **Kanban cards show more at a glance**: source platform badge, relative "Posted Nd ago" (falling
  back to "Found Nd ago" from `discoveredAt` if `postedAt` is null — no date library is installed,
  it's a small local helper next to `docStatus()`), and a truncated notes preview. Clicking a
  card's title (or the notes preview) opens a detail dialog that now also shows the full job
  description above the notes editor — previously the description was only visible on Discovery,
  so reviewing it while working the pipeline meant leaving the page. Deliberately skipped: explicit
  stage text (redundant with the column header).
- **Recategorization of already-ingested postings is a deliberate one-off script, not automatic.**
  `scrapers/src/scripts/recategorize.ts` re-runs the current `categorize()` logic against every
  existing `Posting` row and updates only the ones whose category actually changed — safe to
  re-run any time `categorize()`'s logic changes. New postings are always categorized correctly at
  ingest time; this exists because rows ingested *before* a `categorize()` fix stay on their old
  (possibly wrong) category forever otherwise, per the project's existing "no automatic
  retroactive recategorization" convention. Run via `npx tsx src/scripts/recategorize.ts` in
  `scrapers/`.
- **Not every adapter can capture a description, and that's a verified fact, not a gap to
  guess-fill.** `bamboohr.ts` now does (per-job detail endpoint,
  `result.jobOpening.description`, confirmed live). `adp.ts` genuinely has no description anywhere
  in its public API — checked the list endpoint, the per-item detail endpoint, and every nested
  field (`postingInstructions`, `additionalProperties`, `links`) live against a real org; none of
  it carries description text. `aaimtrack.ts` wasn't verifiable this round because the one
  configured org (Cardinals) had zero live postings to test a detail endpoint against — revisit
  when it has openings, don't guess at a shape.
- **`teamPageAdapter` supports an optional `descriptionSelector`** — when set, it navigates to
  each posting's own detail page (the `href` from `linkSelector`) and pulls `textContent` from
  that selector, same per-posting-detail-fetch pattern as `workday.ts`/`bamboohr.ts`. Only add it
  after finding and confirming the real selector live (`page.$eval` against an actual detail page)
  — never guess a class name from memory or docs. **San Diego Padres**: confirmed
  `.careers-description__container` on Hireology's detail page
  (`careers.hireology.com/sandiegopadres/<id>/description`), live-verified (6.5KB of real
  description text). **Minnesota Twins**: still omitted — the page has had zero live postings
  every time it's been checked, so there's no real detail page to verify a selector against yet.
  **Milwaukee Brewers**: still omitted — a first pass found the detail page's top-level document
  only has site-chrome text (nav/footer), and `page.frames()` lists several cross-origin ad/
  tracking iframes but nothing obviously content-bearing; genuinely unresolved (not confirmed
  impossible), just not worth more time on one team's description text right now. See the comment
  block in `sources.config.ts` for the exact detail per team.
- **Color theme is MLB-inspired (navy + red + white), not grayscale** — all in
  `ui/src/index.css`'s `:root`/`.dark`/`@theme inline` blocks (Tailwind v4 CSS-first, no JS config
  file exists). Both light and dark variants were updated together, per the existing dark-mode
  convention. `Pipeline.tsx`'s `CATEGORY_COLORS` (fixed Tailwind blue/purple/teal/amber/gray
  classes for category badges) intentionally weren't touched — they're literal Tailwind utility
  classes, not driven by the CSS variables, so there's no actual collision risk with the new navy
  primary/red accent to reconcile despite it looking like an obvious thing to check.
- **`npx tsc --noEmit` in `ui/` silently checks nothing — use `npx tsc -b` (build mode).**
  `ui/tsconfig.json` is a project-references root with `"files": []`; plain `tsc --noEmit` against
  it has zero files to check and exits clean regardless of real errors in `src/`. This is a real
  footgun — a stretch of "type-check passed" claims in one session turned out to be false
  positives from calling it wrong, only caught when `tsc -b` was used instead and immediately
  surfaced a genuine error. `api/` and `scrapers/` don't have this problem (plain non-composite
  tsconfigs) — this gotcha is specific to `ui/`'s project-references setup.
- **Discovery is paginated** (`ui/src/components/Pagination.tsx`, composed from the existing
  `Button`/`Select` — no pagination primitive exists in `ui/src/components/ui`, and none was
  added for this). `GET /api/postings` returns the same bare-array body as always (zero breaking
  changes to existing consumers/tests) but now also sets an `X-Total-Count` response header via a
  `prisma.posting.count({ where })` alongside the existing `findMany` — the frontend's
  `api.postings.list()` is the one place that reads it, returning `{ postings, total }` instead of
  a bare array (every other endpoint's `request()` helper is untouched). Page size is selectable
  (25/50/100, default 25); changing any filter or the page size resets to page 1 via a dedicated
  effect, kept separate from the fetch effect to avoid restructuring it.
- **Category/stage/source label casing has one shared source of truth now**:
  `ui/src/lib/labels.ts` exports `CATEGORY_LABELS` (exact map, e.g. `"Baseball R&D"`) and
  `prettifyLabel()` (generic snake_case/ALLCAPS → Title Case fallback, for open-ended keys like
  Analytics' by-source breakdown where there's no fixed enum to map). Previously every page
  (`Discovery.tsx`, `Pipeline.tsx`, `Prep.tsx`, `Analytics.tsx`) did its own
  `.replace(/_/g, " ")`, which turned `BASEBALL_RND` into all-caps "BASEBALL RND" with no
  ampersand — a real, visible bug, not just a style nit. Button labels sitewide are sentence case
  (`"Approve to apply"`, not `"Approve to Apply"`) — Title Case is reserved for nav links only.
- **Home page** (`ui/src/pages/Home.tsx`, route `/`) is the app's actual landing page now —
  Discovery moved to `/discovery` with its own nav entry. Home shows a time-of-day greeting, the
  shared `NotificationBanner` (extracted from Discovery into `ui/src/components/
  NotificationBanner.tsx` since both pages need it), a few top-line stats, and quick-link cards
  into Discovery/Pipeline/Prep. Deliberately reuses existing endpoints only (`api.postings.list`,
  `api.applications.list`, `api.analytics.summary`) — no new backend work for this page. Entrance
  animation is hand-rolled with `tw-animate-css` (`animate-in fade-in slide-in-from-bottom-*`,
  already installed) — no motion library was added.
- **Composing `Button` with `render={<Link .../>}` needs `nativeButton={false}`.** Base UI's
  Button primitive expects the rendered element to actually be a `<button>` unless told otherwise
  — omitting `nativeButton={false}` when rendering as a React Router `Link` (an `<a>`) throws a
  console warning about lost native button semantics even though the component still works
  visually. Caught live in the browser, not by type-checking (this is a runtime prop-contract
  issue, not a type error) — another entry in the running list of Base-UI-not-Radix gotchas this
  project has hit.
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
