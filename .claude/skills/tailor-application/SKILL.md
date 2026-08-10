---
name: tailor-application
description: Generate a tailored resume and/or cover letter draft for a specific job application in the job-app-system pipeline, based on Will's existing base documents and tone.
---

# Tailor Application

Given an `applicationId` (or a posting title/organization to look up), produce a tailored cover letter
(and resume tweaks, if warranted) for that specific job.

## Steps

1. Look up the application and its posting:
   ```bash
   sqlite3 job-app-system/api/data/jobs.db \
     "SELECT a.id, p.title, p.organization, p.description, p.url FROM Application a JOIN Posting p ON a.postingId = p.id WHERE a.id = '<applicationId>';"
   ```
2. Read the base cover letter and resume — use the `isBaseTemplate = 1` documents:
   ```bash
   sqlite3 job-app-system/api/data/jobs.db "SELECT id, label, filePath FROM Document WHERE isBaseTemplate = 1;"
   ```
   Read `Will Paz Resume.pdf`/`.docx` and a representative prior cover letter (e.g. one of the
   baseball-team-specific ones in `Cover Letters/`) to learn Will's tone, structure, and the
   experience he emphasizes — do NOT invent experience not present in the base resume.
3. If the job's description isn't already stored (`Posting.description` is null), fetch the
   posting URL to read the actual job description before writing anything.
4. Draft a new cover letter tailored to this specific posting: reuse the base letter's structure/tone,
   swap in details specific to the org, role, and requirements from the posting. Keep it the same
   rough length as Will's existing letters (~1 page).
5. Save the draft as a `.docx` (matching the existing file convention) in `Cover Letters/`, named
   `Will Paz Cover Letter - <Org> - <Role>.docx`. Use the `docx` skill if you need to produce real
   Word formatting rather than plain text.
6. Register the new draft as a Document and link it to the application:
   ```bash
   cd job-app-system/api && npx tsx -e "
   import { prisma } from './src/db.ts';
   const doc = await prisma.document.create({ data: { kind: 'cover_letter', label: '<label>', filePath: '<absolute path>' } });
   await prisma.application.update({ where: { id: '<applicationId>' }, data: { coverDocId: doc.id, stage: 'REVIEWING' } });
   await prisma.\$disconnect();
   "
   ```
7. Tell Will where the draft was saved and flag anything in the job description that the base resume
   doesn't obviously cover, so he can decide whether to adjust before applying — never submit anything
   on his behalf.
