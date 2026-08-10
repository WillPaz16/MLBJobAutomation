---
name: add-job-source
description: Add a new job posting source (a company/team's career page) to the discovery pipeline in job-app-system/scrapers.
---

# Add Job Source

Adding a source should almost always be a config change, not new code — the adapter for the
platform the org uses (Greenhouse, Lever, Workday, or a config-driven team page scrape) already
exists in `job-app-system/scrapers/src/adapters/`.

## Steps

1. **Identify the platform** the org's careers page runs on:
   - URL contains `boards.greenhouse.io/<token>` or the page is embedded from there → Greenhouse.
   - URL contains `jobs.lever.co/<site>` → Lever.
   - URL contains `myworkdayjobs.com/<host>/<site>` (or `/en-US/<site>`) → Workday.
   - Anything else (a custom-built careers page) → generic team-page adapter.
2. **Verify the platform's data source is reachable without solving a bot challenge.** Try the
   underlying API directly before writing selectors:
   - Greenhouse: `curl https://boards-api.greenhouse.io/v1/boards/<token>/jobs`
   - Lever: `curl https://api.lever.co/v0/postings/<site>?mode=json`
   - Workday: `curl -X POST https://<host>/wday/cxs/<tenant>/<site>/jobs -H "Content-Type: application/json" -d '{"appliedFacets":{},"limit":5,"offset":0,"searchText":""}'`
   If a `curl`/headless request hangs or returns a Cloudflare/challenge page (as happens with
   teamworkonline.com), do NOT try to work around it with a real browser session or stealth
   Playwright config — that's circumventing bot detection and is off-limits. Tell Will the source
   can't be automated and suggest he check it manually, or look for an alternate platform the same
   org might also post through (many orgs also list on Greenhouse/Lever even if an aggregator like
   Teamwork Online is their primary listing).
3. **Add the config entry** to `job-app-system/scrapers/src/sources.config.ts` in the matching
   array (`greenhouseSources`, `leverSources`, `workdaySources`, or `teamPageSources`). Don't touch
   adapter code in `adapters/` unless the platform itself is genuinely new.
4. For a **team-page adapter** entry, first inspect the live page's DOM (in a real browser, not
   curl) to find stable selectors for the job card container, title, link, and location — then
   fill in `teamPageSources` and verify with a dry run before considering it done.
5. **Verify end to end**:
   ```bash
   cd job-app-system/scrapers && npx tsx src/runDiscovery.ts
   ```
   Confirm the new org's postings show up with `+N new`, then run it again and confirm `+0 new`
   (dedup working). If postings show the wrong category, check/extend the keyword lists in
   `src/categorize.ts` rather than hand-fixing individual rows.
