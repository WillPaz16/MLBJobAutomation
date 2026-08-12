---
name: add-job-source
description: Add a new job posting source (a company/team's career page) to the discovery pipeline in job-app-system/scrapers.
---

# Add Job Source

Adding a source should almost always be a config change, not new code — an adapter for the
platform the org uses already exists in `job-app-system/scrapers/src/adapters/`: Greenhouse,
Lever, Workday, ADP (Workforce Now), UKG Pro Recruiting (aka UltiPro), BambooHR, aaimtrack.com,
TeamWork Online, Dayforce HCM, the generic team-page adapter (Playwright DOM scraping), and the
GitHub job-list-repo adapter (see its own section below). New adapter code is only warranted when
the org's platform genuinely isn't one of these eleven.

## Steps

1. **Identify the platform** the org's careers page runs on:
   - `boards.greenhouse.io/<token>` (or embedded from there) → Greenhouse.
   - `jobs.lever.co/<site>` → Lever.
   - `myworkdayjobs.com/<host>/<site>` (or `/en-US/<site>`) → Workday.
   - `workforcenow.adp.com` → ADP.
   - `recruiting.ultipro.com` / `recruiting2.ultipro.com` / `<org>.rec.pro.ukg.net` → UKG Pro
     Recruiting (all the same platform/API shape despite different hosts).
   - `<company>.bamboohr.com/careers` → BambooHR.
   - `aaimtrack.com` → aaimtrack.
   - `teamworkonline.com/baseball-jobs/<org>/<org>` → TeamWork Online.
   - A Dayforce-hosted candidate portal → Dayforce HCM.
   - Anything else (a custom-built careers page) → generic team-page adapter.
2. **Verify the platform's data source is reachable, following the actual escalation ladder** (see
   CLAUDE.md's MLB-coverage notes for the full detail and the reversals that motivated it):
   1. Try a plain `fetch`/`curl` **with a real browser `User-Agent` header** first — a missing or
      generic UA can look identical to a real bot block when it isn't one (TeamWork Online's own
      team career pages turned out to be plain server-rendered HTML this way, after being wrongly
      assumed blocked for years).
   2. Look for a JSON API via browser network capture (not curl-guessing — a client-rendered SPA
      won't reveal its API to curl at all). Greenhouse/Lever/Workday/ADP/UKG/BambooHR/aaimtrack all
      expose one; hit it directly.
   3. If that JSON API 403s on a raw `curl`/`fetch`, retry it via **genuine Playwright navigation**
      before writing it off — a block on standalone HTTP replay does not mean browser automation is
      blocked too (Dayforce's search API is exactly this case: 403 on replay, 200 from a real
      Playwright page load intercepted via `page.waitForResponse()`).
   4. Only reach for the generic team-page adapter's Playwright **DOM scraping** if the page is
      genuinely client-rendered with no extractable API at all, AND doesn't require solving a
      challenge to load.
   5. A genuine dead end is a CAPTCHA/challenge page, or a block that survives real browser
      navigation on the page load itself — not "curl got a 403" or "the cross-org search page is
      behind Cloudflare" (an individual org's own career page can be a completely different story;
      check every outbound "Apply Now" link, not just the first one found, and remember an org can
      have more than one legitimate posting source). If you hit a genuine dead end, tell Will the
      source can't be automated — do not build anything that defeats bot detection to route
      around it.
3. **Add the config entry** to `job-app-system/scrapers/src/sources.config.ts` in the matching
   array (`greenhouseSources`, `leverSources`, `workdaySources`, `adpSources`, `ukgSources`,
   `bambooHrSources`, `aaimtrackSources`, `teamworkOnlineSources`, `dayforceSources`, or
   `teamPageSources`). Don't touch adapter code in `adapters/` unless the platform itself is
   genuinely new.
4. For a **team-page adapter** entry, first inspect the live page's DOM (in a real browser via
   Playwright, not curl — curl only sees the server-rendered shell, not client-rendered content)
   to find stable selectors for the job card container, title, link, location, and (optionally)
   the detail-page description selector (`descriptionSelector`) — then fill in `teamPageSources`
   and verify with a dry run before considering it done. Some platforms nest the real listing in a
   same-origin iframe that only renders when embedded in its parent page — use `frameUrlContains`
   to search `page.frames()` for it instead of navigating to it directly.
5. **Verify end to end**:
   ```bash
   cd job-app-system/scrapers && npx tsx src/runDiscovery.ts
   ```
   Confirm the new org's postings show up with `+N new`, then run it again and confirm `+0 new`
   (dedup working). If postings show the wrong category, check/extend the keyword lists in
   `src/categorize.ts` rather than hand-fixing individual rows.

## Adding a GitHub job-list repo

A different shape of source: a community-maintained GitHub README tracking postings across 50+
companies in one file, rather than one org's own career page. Handled by
`adapters/jobListRepo.ts` (config type `JobListRepoConfig`), not any of the per-org adapters
above — one config entry here is one whole repo, not one org.

1. **Curl the raw README, including the branch** (`dev` vs `main` differs per repo — get this
   wrong and you'll silently track a stale/abandoned branch):
   ```bash
   curl -A "Mozilla/5.0" "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/README.md"
   ```
2. **Identify the table format**: an HTML `<table>...<tbody>...<tr><td>` block (`tableFormat:
   "html"`), or a pipe-delimited markdown table (`tableFormat: "pipe"`, lines starting with `|`,
   with a `|---|---|` separator row to skip).
3. **List every section header found** (e.g. `## 🤖 Data Science, AI & Machine Learning New Grad
   Roles` or a plain `### Quant`) and decide which ones are actually relevant — skip anything with
   heavy overlap with an existing source or with no DS/analytics signal. A repo with **no** section
   headers at all needs `sectionHeaderRe: null` and `sections: [FLAT_SECTION]`, which makes
   `titleIncludeRe` mandatory (the adapter throws at fetch time if it's missing, to avoid dumping
   an entire flat, mostly-unrelated table into one bucket).
4. **Count rows per section** you're planning to include, and **map column indices**
   (`columns.company/title/location/apply`, optionally `salary`) — note that some repos vary
   column count *between sections of the same repo* (e.g. a Salary column present in one section's
   table but not another's); the adapter's apply-link detection searches for the `alt="Apply"`
   image signature across all cells before falling back to a fixed index, so don't assume a single
   index works for every section without checking.
5. **Run the dry-run script before touching `sources.config.ts` at all**:
   ```bash
   cd job-app-system/scrapers && npx tsx src/scripts/dryRunJobListRepo.ts
   ```
   It fetches and parses only — no DB writes — and prints total/per-section row counts plus the
   first 10 parsed rows, so you can sanity-check organization/title/location extraction and a
   `titleIncludeRe` filter's actual hit rate before it's live.
6. **Set `minExpectedPostings` to ~50% of the observed post-filter count from that dry run** — not
   a guess. This is a real safety net: `ingest.ts`'s closing pass treats a parse regression that
   silently yields fewer rows as "postings disappeared," which can mass-close active postings after
   2 missed runs. The adapter throws before any DB write if the parsed count falls below this
   floor, or if a configured section isn't found at all, or if the freshly parsed total for the
   whole repo is less than 50% of the currently-active count for that Source in the DB (the
   dynamic, DB-relative guard, checked in `runJobListRepoAdapter` since it needs the source id).
7. **Only then add the entry** to `jobListRepoSources` in `sources.config.ts`, and verify end to
   end the same way as any other source (`+N new`, then `+0 new` on a second run).
