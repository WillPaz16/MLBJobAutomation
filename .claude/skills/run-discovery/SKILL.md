---
name: run-discovery
description: Run all job-source scrapers, dedup against existing postings, then generate and report a summary of what needs review. Use for the daily job-discovery check.
---

# Run Discovery

1. Run the scraper pipeline:
   ```bash
   cd job-app-system/scrapers && npx tsx src/runDiscovery.ts
   ```
   This hits Greenhouse/Lever/Workday sources from `sources.config.ts` plus any configured
   team-page adapters, dedupes against existing `Posting` rows, and inserts only new ones.
2. Generate the notification summary (new postings awaiting review + stalled applications):
   ```bash
   curl -s -X POST http://localhost:4000/api/notifications/summary
   ```
   If the API isn't already running, start it first: `cd job-app-system/api && npx tsx src/index.ts &`
   then stop it again when done if you started it just for this.
3. Report back to Will: how many new postings were found (by category — flag baseball
   ops/analytics/R&D ones specifically since those are the priority), and how many
   applications have been sitting in REVIEWING/APPLIED for >10 days without an update.
4. If `sources.config.ts` has grown stale (an org stopped posting, or a new org should be
   added — e.g. Will mentions a new team/board), use the `add-job-source` skill rather than
   editing scraper code directly.
