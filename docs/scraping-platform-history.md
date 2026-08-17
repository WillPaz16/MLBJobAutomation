# Scraping platform coverage history

Detailed history of ATS platform coverage decisions, dead-end reversals, and adapter-specific
verification notes for `job-app-system/scrapers`. Split out of `CLAUDE.md` since this is deep
reference material, not something every session needs loaded — pull it in when working on
`sources.config.ts` or an adapter.

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
</content>
</invoke>
