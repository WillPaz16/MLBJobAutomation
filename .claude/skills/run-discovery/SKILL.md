---
name: run-discovery
description: Run all job-source scrapers, dedup against existing postings, then generate and report a summary of what needs review. Use for the daily job-discovery check.
---

# Run Discovery

This same job now also runs on its own schedule inside the API process (`api/src/scheduler.ts`,
see `CLAUDE.md`'s Scheduling section) — this skill is for running it on demand instead of waiting.

1. Trigger it: `curl -s -X POST http://localhost:4000/api/scheduler/run-now` (start the API first
   if it's not already running: `cd job-app-system/api && npx tsx src/index.ts &` — or better,
   check `npx pm2 list` first, since it may already be supervised).
   This backs up the db, runs the scraper pipeline (Greenhouse/Lever/Workday sources from
   `sources.config.ts` plus any configured team-page adapters, deduping against existing
   `Posting` rows), and generates the notification summary, all in one call.
2. Read the result: `curl -s http://localhost:4000/api/notifications | head -1` — the most recent
   entry is this run's summary (or a `⚠️`-prefixed failure message if something broke).
3. Report back to Will: how many new postings were found (by category — flag baseball
   ops/analytics/R&D ones specifically since those are the priority), and how many
   applications have been sitting in REVIEWING/APPLIED for >10 days without an update.
4. If `sources.config.ts` has grown stale (an org stopped posting, or a new org should be
   added — e.g. Will mentions a new team/board), use the `add-job-source` skill rather than
   editing scraper code directly.
