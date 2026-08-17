# MLBJobAutomation

A personal, local-first job search automation system for tracking and applying to baseball
operations / analytics / R&D roles and general data science jobs.

Everything runs on my own machine — SQLite database, a local Express API, and a React UI. Nothing
is deployed anywhere, and no application is ever submitted automatically: the system surfaces
postings and drafts, and I always review and submit applications myself.

## What it does

- **Discovers postings** by scraping team/company career pages directly via each org's own job
  board API (Greenhouse, Lever, Workday, ADP, UKG, BambooHR, and others), rather than aggregator
  sites — covers all 30 MLB teams plus a set of non-MLB quant/data-science employers.
- **Tracks a pipeline** (Discovery → Reviewing → Applied → ...) through a Kanban-style board, with
  duplicate detection across sources and automatic closed/reopened posting tracking.
- **Assists with prep**, not submission: it surfaces application backlogs, joins posting +
  resume/cover-letter context for drafting, and includes an opt-in helper that fills in an
  application form's fields for review — it never clicks submit.

## Stack

- `job-app-system/api/` — Express + Prisma/SQLite
- `job-app-system/scrapers/` — source adapters + a daily discovery scheduler
- `job-app-system/ui/` — React (Vite) + Tailwind, Base UI components

## Running locally

```bash
cd job-app-system && npm run dev
```

Boots the API and UI together. See [`CLAUDE.md`](CLAUDE.md) for full setup, scheduling, and
architecture details.
