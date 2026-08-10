---
name: tailor-application
description: Generate a tailored resume and/or cover letter draft for a specific job application in the job-app-system pipeline, based on Will's existing base documents, tone presets, and org profile.
---

# Tailor Application

Given an `applicationId` (or a posting title/organization to look up), produce a tailored cover
letter (and resume tweaks, if warranted) for that specific job — drawing on the structured
tailoring framework (`ResumeBullet`, `TonePreset`, `OrgProfile`) instead of re-deriving tone/
content from scratch each time.

All reads/writes go through the API (`http://localhost:4000`, start it first if it's not already
running: `cd job-app-system/api && npx tsx src/index.ts &`) — not raw `sqlite3`/`tsx -e` one-liners.
That keeps the skill consistent with how the rest of the app reads/writes data and means every
write goes through the same zod validation as the UI.

## Steps

1. Fetch everything needed in one call:
   ```bash
   curl -s "http://localhost:4000/api/applications/<applicationId>/prep-context"
   ```
   Returns `{ application (with posting), orgProfile, tonePreset, resumeBullets }` in one response
   — `orgProfile` is `null` if this is the first application to this org (a profile can be created
   in step 7 once the letter is drafted); `tonePreset` is already resolved (the org's
   `preferredTone` if set, otherwise the default preset) so there's no separate pick-a-tone step.
   `resumeBullets` is pre-filtered to the posting's category plus anything tagged `general`.
   Also read the base resume/cover letter files directly (`GET /api/documents` filtered to
   `isBaseTemplate=true` for the `filePath`s) to see Will's actual voice/structure — the bullets
   library and tone preset guide the draft, they don't replace reading real prior examples.
2. If the job's description isn't already stored (`prep-context`'s `application.posting.description`
   is null), fetch the posting URL to read the actual job description before writing anything.
3. Draft a new cover letter tailored to this specific posting: follow the resolved tone preset's
   guidance, work in relevant resume bullets naturally, swap in details specific to the org/role/
   requirements from the posting. Keep it the same rough length as Will's existing letters (~1
   page). Never invent experience not present in the base resume or bullet library.
4. Add a short **personalized talking points** section (3-5 bullets) connecting Will's background
   to this specific posting/org — concrete enough to paste into whatever open-answer fields the
   real application form has (e.g. "why this org," "why this role"). This is deliberately not a
   literal question-by-question answer key — no adapter reliably exposes an application's actual
   questions in a parseable way, so this stays a general-purpose set of talking points rather than
   attempting to guess and answer specific form fields. Append it to the cover letter draft (a
   short final section) or, if it reads better standalone, save it into `Application.notes` in
   step 6 instead.
5. Save the draft as a `.docx` in `Cover Letters/`, named exactly
   `Will Paz Cover Letter - <Org> - <Role>.docx` (paired with a `.pdf` export) — this is the
   canonical naming convention going forward; don't perpetuate the older inconsistent patterns
   found in some existing files (missing "Will Paz" prefix, swapped word order, role-before-org).
   Use the `docx` skill for real Word formatting.
6. Register the draft and link it to the application:
   ```bash
   curl -s -X POST http://localhost:4000/api/documents -H "Content-Type: application/json" -d '{
     "kind": "cover_letter",
     "label": "Will Paz Cover Letter - <Org> - <Role>",
     "filePath": "<absolute path to the .docx>",
     "generatedFromBulletIds": "<comma-separated ResumeBullet ids actually used>",
     "toneId": "<TonePreset id used>"
   }'
   curl -s -X PATCH http://localhost:4000/api/applications/<applicationId> -H "Content-Type: application/json" -d '{
     "coverDocId": "<new document id>",
     "stage": "REVIEWING",
     "notes": "<personalized talking points, if not appended to the cover letter itself>"
   }'
   ```
7. If this is the first application to this org, create an `OrgProfile` capturing anything worth
   remembering for next time (culture notes, phrasing that worked, a tone preference):
   ```bash
   curl -s -X POST http://localhost:4000/api/org-profiles -H "Content-Type: application/json" -d '{
     "organizationName": "<Org>",
     "notes": "<what you learned>",
     "preferredToneId": "<TonePreset id, if a clear preference emerged>"
   }'
   ```
8. Tell Will where the draft was saved, the posting's URL (so he can go straight there), and flag
   anything in the job description that the base resume/bullet library doesn't obviously cover, so
   he can decide whether to adjust before applying — never submit anything on his behalf, and never
   fill out or submit the actual external application form.

## Working through multiple applications at once

The Pipeline UI's Prep queue (`REVIEWING` applications with no resume/cover doc attached yet) shows
what's outstanding — ask to "prep the next one in the queue" (or a specific application/org by
name) to work through it one at a time. Each one still gets its own read-and-review pass per the
steps above; this isn't a batch-draft-everything-at-once mode; the queue is what makes "mass
applying" faster — knowing at a glance what still needs attention, not skipping the review step.
