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

1. Look up the application and its posting:
   ```bash
   curl -s http://localhost:4000/api/applications | jq '.[] | select(.id == "<applicationId>")'
   ```
2. Check for an existing org profile (per-org memory from prior applications):
   ```bash
   curl -s "http://localhost:4000/api/org-profiles/<organizationName>"
   ```
   If one exists, read its `notes` and follow `preferredTone` if set. If none exists, this is the
   first application to this org — a profile can be created in step 6 once the letter is drafted.
3. Pick a tone preset — use the org profile's `preferredTone` if set, otherwise pick by the
   posting's category:
   ```bash
   curl -s http://localhost:4000/api/tone-presets
   ```
4. Pull candidate resume bullets relevant to the posting's category:
   ```bash
   curl -s "http://localhost:4000/api/resume-bullets?category=<category>&isActive=true"
   ```
   Also read the base resume/cover letter files directly (`GET /api/documents` filtered to
   `isBaseTemplate=true` for the `filePath`s) to see Will's actual voice/structure — the bullets
   library and tone preset guide the draft, they don't replace reading real prior examples.
5. If the job's description isn't already stored (`Posting.description` is null), fetch the
   posting URL to read the actual job description before writing anything.
6. Draft a new cover letter tailored to this specific posting: follow the chosen tone preset's
   guidance, work in relevant resume bullets naturally, swap in details specific to the org/role/
   requirements from the posting. Keep it the same rough length as Will's existing letters (~1
   page). Never invent experience not present in the base resume or bullet library.
7. Save the draft as a `.docx` in `Cover Letters/`, named exactly
   `Will Paz Cover Letter - <Org> - <Role>.docx` (paired with a `.pdf` export) — this is the
   canonical naming convention going forward; don't perpetuate the older inconsistent patterns
   found in some existing files (missing "Will Paz" prefix, swapped word order, role-before-org).
   Use the `docx` skill for real Word formatting.
8. Register the draft and link it to the application:
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
     "stage": "REVIEWING"
   }'
   ```
9. If this is the first application to this org, create an `OrgProfile` capturing anything worth
   remembering for next time (culture notes, phrasing that worked, a tone preference):
   ```bash
   curl -s -X POST http://localhost:4000/api/org-profiles -H "Content-Type: application/json" -d '{
     "organizationName": "<Org>",
     "notes": "<what you learned>",
     "preferredToneId": "<TonePreset id, if a clear preference emerged>"
   }'
   ```
10. Tell Will where the draft was saved and flag anything in the job description that the base
    resume/bullet library doesn't obviously cover, so he can decide whether to adjust before
    applying — never submit anything on his behalf.
