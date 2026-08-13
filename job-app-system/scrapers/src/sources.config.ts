// Config-driven source lists. Add new orgs here without touching adapter code.
// Every entry below was verified with a live curl against its actual API before being added —
// see the add-job-source skill for the verification steps to follow when adding more.

import { FLAT_SECTION, type JobListRepoConfig } from "./adapters/jobListRepo.js";

// Greenhouse: find an org's board token from their careers page URL: boards.greenhouse.io/<boardToken>.
export const greenhouseSources: { boardToken?: string; boardTokens?: string[]; organizationName: string }[] = [
  // MLB baseball ops/analytics-adjacent boards
  // Phillies run two separate Greenhouse boards for the same org — business ops returned 0 live
  // jobs when last checked (2026-08-11) but is kept since it's a real, distinct board that could
  // post again; baseball ops is where roles like "Quantitative Analyst Associate" actually show
  // up. Combined into ONE config entry via boardTokens (rather than two separate entries sharing
  // one organizationName) so this results in exactly one ingestPostings call for "Philadelphia
  // Phillies" — two entries with the same organizationName under one shared "greenhouse" Source
  // would each run ingest.ts's closing pass scoped to (sourceId, organization), and each board's
  // pass would only see ITS OWN externalIds as "seen," incorrectly treating the other board's
  // still-live postings as missing. See CLAUDE.md / v9 plan Phase 4 task 3.
  { boardTokens: ["philliesbusinessops", "philliesbaseballoperations"], organizationName: "Philadelphia Phillies" },
  { boardToken: "clevelandguardiansbops", organizationName: "Cleveland Guardians" },
  { boardToken: "baltimoreorioles", organizationName: "Baltimore Orioles" },
  // athleticsbaseballops returns 0 live jobs (checked 2026-08-11) and is likely dead/renamed —
  // athleticsbusinessops (14 live jobs incl. "Director, Ticket Operations", "Director,
  // Production Technology (Ballpark)") and athletics (1 live job, "Bullpen Catcher") are the
  // real current boards, both curl-verified live. Dropping the dead token rather than keeping
  // it like Phillies' since there's no reason to expect it to start posting again under that
  // exact name. Combined into one boardTokens entry for the same closing-pass-scoping reason as
  // Phillies above — one organizationName, one ingestPostings call.
  { boardTokens: ["athleticsbusinessops", "athletics"], organizationName: "Athletics" },
  // Non-MLB employer boards, added deliberately and narrowly per the v7 plan's "3d. Employer
  // boards" — Hudl and Catapult Sports are both sports-analytics employers whose full boards are
  // small enough (~25-27 jobs each) not to flood Discovery, unlike the generic big-tech Greenhouse
  // boards (Airbnb/Coinbase/Instacart/Robinhood/FanDuel/Palantir + Catapult Sports itself) removed
  // in dcddaa8 in favor of the SimplifyJobs new-grad-list source. Catapult Sports was collateral in
  // that blanket removal, not removed for its own content (closeRemovedSourceOrgs.ts's comment
  // cites the new-grad-list replacement for the whole batch, with no Catapult-specific complaint
  // about seniority/geography) — re-adding it now as its own small dedicated board, rather than
  // folded into that generic batch, doesn't repeat the reasoning that got it removed.
  // boards-api.greenhouse.io/v1/boards/hudl/jobs — 25 live jobs, curl-verified 2026-08-12.
  { boardToken: "hudl", organizationName: "Hudl" },
  // boards-api.greenhouse.io/v1/boards/catapultsports/jobs — 27 live jobs, curl-verified 2026-08-12.
  { boardToken: "catapultsports", organizationName: "Catapult Sports" },
  // Quant trading firms, added per the non-MLB "data science" coverage-gap follow-up
  // (2026-08-13). All curl-verified live with a real browser User-Agent before adding.
  // boards-api.greenhouse.io/v1/boards/jumptrading/jobs — 102 live jobs.
  { boardToken: "jumptrading", organizationName: "Jump Trading" },
  // boards-api.greenhouse.io/v1/boards/akunacapital/jobs — 35 live jobs.
  { boardToken: "akunacapital", organizationName: "Akuna Capital" },
  // boards-api.greenhouse.io/v1/boards/imc/jobs — 164 live jobs (global board, not just US/quant
  // roles — kept anyway since it's a directly-targeted quant firm, not a generic big-tech
  // overlap board like the ones removed for simplify-new-grad).
  { boardToken: "imc", organizationName: "IMC Trading" },
  // boards-api.greenhouse.io/v1/boards/transmarketgroup/jobs — 17 live jobs.
  { boardToken: "transmarketgroup", organizationName: "TransMarket Group" },
  // Non-quant, non-MLB data-science coverage-gap follow-up (2026-08-13): health-data/biotech and
  // health-insurance analytics employers with real entry-level-worded DS/analyst roles, found via
  // curl with a real browser User-Agent, NOT already covered by any jobListRepo aggregator.
  // boards-api.greenhouse.io/v1/boards/flatironhealth/jobs — 34 live jobs, curl-verified
  // 2026-08-13, incl. genuine entry/analyst-level DS titles: "Data Analyst - Evidence Solutions",
  // "Data Analyst - Product Data Science" (alongside senior roles, but real analyst-level signal
  // present, unlike the big-tech boards removed for simplify-new-grad).
  { boardToken: "flatironhealth", organizationName: "Flatiron Health" },
  // boards-api.greenhouse.io/v1/boards/cloverhealth/jobs — 67 live jobs, curl-verified 2026-08-13,
  // incl. "Data Analyst, Clinical Data Effectiveness", "Data Analyst, Value-Based Care Analytics",
  // "Actuarial Analyst" — real entry-level analyst/actuarial titles, health-insurance analytics.
  { boardToken: "cloverhealth", organizationName: "Clover Health" },
  // DRW's own careers page (www.drw.com/work-at-drw/listings) is a Next.js app with no visible
  // ATS signature in its static HTML — but its __NEXT_DATA__ job payload's own `absolute_url`
  // field (https://job-boards.greenhouse.io/drweng/jobs/<id>) reveals DRW is actually Greenhouse-
  // hosted under the board token "drweng." Confirmed live 2026-08-13:
  // boards-api.greenhouse.io/v1/boards/drweng/jobs?content=true returns 159 jobs — the exact same
  // count as DRW's own site listing — so no separate DRW-specific adapter/detail-fetch is needed
  // at all; this is just another Greenhouse board.
  { boardToken: "drweng", organizationName: "DRW" },
];

// SIG careers.sig.com's own job-search widget API — a job-search-widget-in-front-of-iCIMS
// platform, not the iCIMS apply page itself. Single org today, but kept as a config-driven array
// (rather than a bare object) for consistency with the rest of this file and in case another
// employer turns up on the same widget platform later.
// careers.sig.com/api/jobs?page=1&sortBy=relevance&descending=false&internal=false —
// curl-verified live 2026-08-13 with a real browser User-Agent (246 live jobs at the time).
export const sigCareersSources: { organizationName: string }[] = [
  { organizationName: "Susquehanna International Group, LLP" },
];

// Optiver's own careers JSON API (optiver.com/en/api/v1/jobs) — curl-verified live 2026-08-13
// (184 live jobs at the time; the boards-api.greenhouse.io/v1/boards/optiver/jobs token that also
// exists returns 0 jobs and appears stale/unused — this API is the real live source). Single org
// today, kept as a config-driven array for consistency with the rest of this file.
export const optiverSources: { organizationName: string }[] = [{ organizationName: "Optiver" }];

// Pinpoint ATS — a distinct platform (like BambooHR/aaimtrack), config-driven by subdomain.
// wolve.pinpointhq.com/postings.json — curl-verified live 2026-08-13 (14 live jobs, full field
// shape inspected live, no pagination metadata/headers — a bare `{data: [...]}` per org's board).
export const pinpointSources: { subdomain: string; organizationName: string }[] = [
  { subdomain: "wolve", organizationName: "Wolverine Trading" },
];

// Lever: find an org's site slug from their careers page URL: jobs.lever.co/<site>.
export const leverSources: { site: string; organizationName: string }[] = [
  { site: "redsox", organizationName: "Boston Red Sox" },
  { site: "sfgiants", organizationName: "San Francisco Giants" },
  // api.lever.co/v0/postings/belvederetrading?mode=json — quant trading firm, curl-verified live
  // 2026-08-13 (found via the "lever-jobs-container" anchor on belvederetrading.com/careers).
  { site: "belvederetrading", organizationName: "Belvedere Trading" },
];

// Workday: several MLB teams' front offices run on Workday-hosted career sites
// (URL shape: https://<host>/en-US/<site>). tenant/host/site come from that URL.
export const workdaySources: { tenant: string; host: string; site: string; organizationName: string }[] = [
  { tenant: "my1060wd", host: "my1060wd.wd5.myworkdayjobs.com", site: "Chicago_Cubs_FO", organizationName: "Chicago Cubs" },
  { tenant: "atlantabravesmlb", host: "atlantabravesmlb.wd5.myworkdayjobs.com", site: "AtlantaBraves", organizationName: "Atlanta Braves" },
  { tenant: "mariners", host: "mariners.wd5.myworkdayjobs.com", site: "Mariners", organizationName: "Seattle Mariners" },
  { tenant: "sterlingmets", host: "sterlingmets.wd5.myworkdayjobs.com", site: "Mets", organizationName: "New York Mets" },
  { tenant: "rangersmlb", host: "rangersmlb.wd5.myworkdayjobs.com", site: "Rangers", organizationName: "Texas Rangers" },
  { tenant: "ilitch", host: "ilitch.wd5.myworkdayjobs.com", site: "Detroit-Tigers", organizationName: "Detroit Tigers" },
];

// ADP (Workforce Now career center): find client/cid from the org's career center URL —
// workforcenow.adp.com/.../recruitment.html?...&client=<client>&cid=<cid>&...
export const adpSources: { client: string; cid: string; organizationName: string }[] = [
  { client: "nyyanks", cid: "5ebae4fe-1105-47a5-b26d-e74868af6e86", organizationName: "New York Yankees" },
  { client: "tbrays", cid: "d4e6b608-831f-4a04-bdb6-f61493552d27", organizationName: "Tampa Bay Rays" },
];

// UKG Pro Recruiting (formerly UltiPro) — host varies by org (recruiting.ultipro.com,
// recruiting2.ultipro.com, or <org>.rec.pro.ukg.net), find tenant/boardId from the org's
// careers URL: https://<host>/<tenant>/JobBoard/<boardId>/...
export const ukgSources: { host: string; tenant: string; boardId: string; organizationName: string }[] = [
  {
    host: "recruiting.ultipro.com",
    tenant: "LOS1000LADOD",
    boardId: "5365ad6e-23ff-4703-bb77-1e9451fb855e",
    organizationName: "Los Angeles Dodgers",
  },
  {
    host: "pirates.rec.pro.ukg.net",
    tenant: "PIT1500PITA",
    boardId: "1571bce9-cb30-4961-98da-07b26506146a",
    organizationName: "Pittsburgh Pirates",
  },
  {
    host: "recruiting2.ultipro.com",
    tenant: "COL1047COLBA",
    boardId: "17b65dc7-8957-462f-bbe5-957d054a4367",
    organizationName: "Colorado Rockies",
  },
  {
    host: "recruiting2.ultipro.com",
    tenant: "HOU1000",
    boardId: "e68ddd55-8f58-ba9d-0b3a-76742aed1055",
    organizationName: "Houston Astros",
  },
  {
    host: "recruiting2.ultipro.com",
    tenant: "ANG1000ANGEL",
    boardId: "c2c34b69-1480-428d-a3a9-c45e8297edb3",
    organizationName: "Los Angeles Angels",
  },
  {
    host: "washnats.rec.pro.ukg.net",
    tenant: "MON1001WNBC",
    boardId: "769be41b-7ab1-40e5-b837-33d7c87b5787",
    organizationName: "Washington Nationals",
  },
  {
    host: "recruiting2.ultipro.com",
    tenant: "CHI1000CWS",
    boardId: "8e2339b4-b699-46e9-8b91-e3e826e53794",
    organizationName: "Chicago White Sox",
  },
];

// BambooHR careers API — find <company> from the org's careers URL: <company>.bamboohr.com/careers.
export const bambooHrSources: { company: string; organizationName: string }[] = [
  { company: "torontobluejays", organizationName: "Toronto Blue Jays" },
];

// aaimtrack.com — find subdomain + domainId from the org's careers URL and its own XHR calls to
// /core/jobs/<domainId> (no public docs for this API; domainId is only visible via network tab).
export const aaimtrackSources: { subdomain: string; domainId: string; organizationName: string }[] = [
  { subdomain: "stlcardinals", domainId: "1932", organizationName: "St. Louis Cardinals" },
];

// TeamWork Online team career pages — server-rendered HTML, no Cloudflare challenge with a real
// browser User-Agent (see teamworkonline.ts). orgPath is the URL segment after /baseball-jobs/.
export const teamworkOnlineSources: { orgPath: string; organizationName: string }[] = [
  { orgPath: "miamibaseball/miami-marlins", organizationName: "Miami Marlins" },
  { orgPath: "cincinnati-reds/cincinnati-reds", organizationName: "Cincinnati Reds" },
  // Royals/Diamondbacks also post to Dayforce (jobs.dayforcehcm.com), which is genuinely bot-
  // protected — see the dead-end comment below. TeamWork Online is the actual scrapable source
  // for these two, found via their official mlb.com career pages' "View Postings"/apply links.
  { orgPath: "kansas-city-royals-jobs/kansas-city-royals", organizationName: "Kansas City Royals" },
  { orgPath: "arizona-diamondbacks-jobs/arizona-diamondbacks", organizationName: "Arizona Diamondbacks" },
];

// Dayforce HCM candidate portals — blocks raw API replay but not genuine Playwright navigation
// (see dayforce.ts). Used only where a team's Dayforce postings aren't a strict subset of what's
// already covered by another source for that same org (currently: Royals, Diamondbacks also post
// to TeamWork Online, but Dayforce has additional postings TeamWork Online doesn't).
export const dayforceSources: { tenant: string; organizationName: string }[] = [
  { tenant: "royals", organizationName: "Kansas City Royals" },
  { tenant: "dbacks", organizationName: "Arizona Diamondbacks" },
];

// Team career pages not on Greenhouse/Lever/Workday/ADP/UKG/BambooHR. Validate selectors against
// the live page before adding an entry here — see teamPage.ts adapter docs for the config contract.
export const teamPageSources: {
  organizationName: string;
  listUrl: string;
  cardSelector: string;
  titleSelector: string;
  linkSelector: string;
  locationSelector?: string;
  frameUrlContains?: string;
  descriptionSelector?: string;
}[] = [
  {
    organizationName: "Milwaukee Brewers",
    listUrl: "https://careers-brewers.icims.com/jobs/search?ss=1&searchRelation=keyword_all",
    // iCIMS renders the actual listing in a same-origin iframe that won't load standalone —
    // it depends on being embedded in this parent page. See teamPage.ts's frameUrlContains docs.
    frameUrlContains: "in_iframe=1",
    cardSelector: ".row:has(.col-xs-12.title)",
    titleSelector: ".col-xs-12.title a h3",
    linkSelector: ".col-xs-12.title a",
    locationSelector: ".header.left span:not(.sr-only)",
  },
  {
    organizationName: "San Diego Padres",
    listUrl: "https://careers.hireology.com/sandiegopadres",
    cardSelector: ".careers-job-list__table-row",
    titleSelector: ".careers-job-list__table-row-link a",
    linkSelector: ".careers-job-list__table-row-link a",
    locationSelector: ".careers-job-list__table-row-text",
    // Confirmed live against a real posting's detail page.
    descriptionSelector: ".careers-description__container",
  },
  {
    organizationName: "Minnesota Twins",
    listUrl: "https://recruitingbypaycor.com/career/CareerHome.action?clientId=8a7883d08b729b3e018b72dc67f6007f",
    cardSelector: ".gnewtonCareerGroupRowClass",
    titleSelector: ".gnewtonCareerGroupJobTitleClass a",
    linkSelector: ".gnewtonCareerGroupJobTitleClass a",
    locationSelector: ".gnewtonCareerGroupJobDescriptionClass",
    // No descriptionSelector: the Twins page has had zero live postings every time this was
    // checked, so there's no real detail page to verify a selector against — add one only after
    // confirming live, per convention, not by guessing at Paycor's markup from docs/memory.
  },
];

// Brewers (iCIMS): descriptionSelector intentionally omitted, not because it's confirmed
// impossible but because it wasn't found on a first pass and isn't worth more time for one team's
// description text right now. What was actually checked: the detail page's top-level document
// body only contains site-chrome text (nav links, footer) — the description isn't there via a few
// plausible selector guesses (`[class*=description]`, `.iCIMS_JobContent`, etc.). `page.frames()`
// on that URL lists several cross-origin ad/tracking iframes but nothing obviously
// content-bearing. This could mean the real content is in a frame not yet identified, or requires
// a different extraction approach — genuinely unresolved, not a dead end. Revisit with more time,
// and verify live again rather than trusting this note if iCIMS' markup may have changed since.

// All 30 MLB teams now have a scrapable source — no dead ends remain. Kept as a record of the
// investigation, since the same techniques apply to any future "this site is blocked" claim.
//
// Kansas City Royals / Arizona Diamondbacks post to BOTH TeamWork Online (above) and Dayforce HCM
// (jobs.dayforcehcm.com, see dayforceSources below) — both are wired in, and cross-source
// duplicate detection (scrapers/src/dedupe.ts) keeps the same job posted to both from showing up
// twice. Dayforce's own `POST /api/geo/<tenant>/jobposting/search` API 403s on every raw
// fetch/curl request — even one replayed from inside the live page's own JS console with matching
// cookies/origin — while only genuine page-navigation-triggered requests succeed. That LOOKED like
// active anti-automation fingerprinting and a real dead end, but it's specifically a block on
// standalone HTTP replay, not on browser automation: a genuine Playwright navigation to the
// candidate portal (same technique as teamPageAdapter) reaches that same endpoint and gets a
// normal 200 with the full job list — see dayforce.ts. This isn't defeating bot detection; the
// site only refuses standalone API calls, and Playwright does exactly what a real visitor's
// browser does. (The candidate portal is also a client-rendered SPA with no server-rendered
// JobPosting structured data and no real RSS/XML feed, so there was never a static-content
// workaround — the Playwright network-interception approach is the only one that works, and it
// does.)
//
// Yankees/Rays (ADP), Dodgers/Pirates/Rockies/Astros/Angels/Nationals/White Sox (UKG), Toronto
// Blue Jays (BambooHR), and Brewers/Padres/Twins (teamPageAdapter, Playwright DOM scrape — none
// of these three had a JSON API, but none had active bot detection either) were all previously
// miscategorized as dead ends. Cardinals (aaimtrack.com) turned out to have a genuine, undocumented
// but plain public JSON API — no auth needed, just an unusual `?getParams=<url-encoded JSON>`
// query shape found via browser network capture. Marlins/Reds/Royals/Diamondbacks — long assumed
// to be blocked by Cloudflare like TeamWork Online's own generic job search — turned out to be
// plain server-rendered HTML on their *team-specific* career pages
// (teamworkonline.com/baseball-jobs/<org>) when fetched with a normal browser User-Agent: no
// challenge page, no JS required, and each posting embeds a clean schema.org JobPosting JSON-LD
// block. The earlier "Teamwork Online = blocked" conclusion was true for the platform's generic
// cross-org search UI but not for these per-team pages.
//
// If a future source looks blocked: (1) find the org's actual outbound "Apply"/"View Postings"
// link rather than trusting a single mlb.com page or a single platform's own search UI — a team
// can have more than one legitimate posting source, so don't stop at the first blocked attempt,
// (2) try a plain fetch with a real User-Agent before assuming Playwright or an internal API is
// required, (3) if a JSON API 403s on a raw fetch/curl request, retry it via genuine Playwright
// navigation before writing it off — a block on standalone HTTP replay doesn't mean browser
// automation is blocked too. No JSON API ≠ dead end, "blocked" on one page of a platform ≠ blocked
// on all of it, and "blocked for curl" ≠ "blocked for Playwright" — only a block that survives
// genuine browser navigation (a CAPTCHA/challenge page, or the page itself failing to load) is a
// real dead end.

// Non-MLB: quant trading firms investigated 2026-08-13 (per Will's Chicago/quant coverage-gap
// note). Jump Trading, Akuna Capital, IMC Trading, TransMarket Group (Greenhouse) and Belvedere
// Trading (Lever) are added above, curl-verified live. The rest are NOT genuine dead ends — they
// need more investigation than a curl pass allows, so don't write them off as blocked:
//   - Wolverine Trading (wolve.com/open-positions): runs on Pinpoint ATS
//     (data-pinpoint-subdomain="wolve"), NOT one of this repo's 11 supported adapter platforms.
//     Its JSON API is real and public — curl-verified live 2026-08-13:
//     `curl -A "Mozilla/5.0..." https://wolve.pinpointhq.com/postings.json` returns real posting
//     data (200, JSON body with job fields). Not a bot-detection dead end at all — just needs a
//     new Pinpoint adapter written (out of scope for a config-only pass), or manual entry in the
//     meantime via POST /api/postings/manual.
//   - Peak6 (peak6.com/careers): landing page has no static job links; loads job data via a
//     "ongig-embed" widget (d171fmx844et9o.cloudfront.net/peak6/2.0/ongig-embed.umd.js), which is
//     a description-enhancement layer, not the underlying ATS — the real ATS behind it wasn't
//     identified via curl alone (client-rendered). Needs Playwright network capture to find the
//     real API before it can be added; not confirmed blocked.
// SIG, DRW, Optiver, and Wolverine Trading (Pinpoint) were all resolved with a follow-up curl
// pass (2026-08-13), no Playwright needed for any of them:
//   - Susquehanna / SIG: careers.sig.com/api/jobs is the site's own job-search-widget API — see
//     sigCareersSources above.
//   - DRW: turned out to be Greenhouse-hosted after all (board token "drweng") — the static HTML
//     has no ATS signature because DRW's own Next.js page wraps the Greenhouse data client-side,
//     but the underlying job payload's `absolute_url` field reveals the real board. See the
//     greenhouseSources entry above; no separate DRW adapter needed.
//   - Optiver: optiver.com/en/api/v1/jobs is a real, live, plain public JSON API (184 jobs) —
//     separate from the stale/unused `boards-api.greenhouse.io/v1/boards/optiver/jobs` token
//     that returns zero. See optiverSources above.
//   - Wolverine Trading: see pinpointSources below — Pinpoint ATS, wolve.pinpointhq.com/
//     postings.json.
// Peak6 remains the one genuine holdout — needs Playwright network capture to intercept its
// live-loaded token, deliberately not pursued this round.

// GitHub job-list repos (adapters/jobListRepo.ts) — community-maintained READMEs tracking
// new-grad/internship tech/DS/quant/PM roles across 50+ companies per repo. Structurally
// different from every other source here: one fetch yields postings spanning many organizations,
// not one config entry = one org (runDiscovery.ts groups by organization before ingesting).
//
// All three `sectionLabel` values below map onto the SAME three `sourceSection` strings the
// original `simplify-new-grad` source has always stored (verified live against the DB — do not
// invent new tab names): "Data Science, AI & Machine Learning", "Quantitative Finance",
// "Product Management". `sourceSection` must have exactly 3 distinct non-null values after any
// of these run.
//
// `minExpectedPostings` is set to ~50% of a verified live dry-run count for each repo (see the
// dryRunJobListRepo.ts script) — re-verify before trusting these numbers again, repos churn daily.
export const jobListRepoSources: JobListRepoConfig[] = [
  // Existing source, re-expressed in the new config shape. `key` MUST match the existing Source
  // row's name ("simplify-new-grad", confirmed live in the DB) so its ~107 existing rows don't
  // get orphaned under a differently-named Source.
  {
    key: "simplify-new-grad",
    readmeUrl: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md",
    tableFormat: "html",
    sectionHeaderRe: /^##\s+\S+\s+(.+?)\s+New Grad Roles\s*$/,
    sections: ["Data Science, AI & Machine Learning", "Quantitative Finance", "Product Management"],
    sectionLabel: {
      "Data Science, AI & Machine Learning": "Data Science, AI & Machine Learning",
      "Quantitative Finance": "Quantitative Finance",
      "Product Management": "Product Management",
    },
    sectionCategory: {
      "Data Science, AI & Machine Learning": "DATA_SCIENCE",
      "Quantitative Finance": "DATA_SCIENCE",
      "Product Management": "OTHER",
    },
    columns: { company: 0, title: 1, location: 2, apply: 3 },
    minCells: 4,
    // Observed live 2026-08-11/12: 83 + 18 + 6 = 107. Floor ~ half.
    minExpectedPostings: 50,
  },
  // Same repo family, internship-scoped sibling of the above — same three sections (just
  // "Internship Roles" instead of "New Grad Roles" in the header suffix), same category mapping,
  // same sourceSection strings (no new tabs).
  {
    key: "simplify-internships",
    readmeUrl: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/README.md",
    tableFormat: "html",
    sectionHeaderRe: /^##\s+\S+\s+(.+?)\s+Internship Roles\s*$/,
    sections: ["Data Science, AI & Machine Learning", "Quantitative Finance", "Product Management"],
    sectionLabel: {
      "Data Science, AI & Machine Learning": "Data Science, AI & Machine Learning",
      "Quantitative Finance": "Quantitative Finance",
      "Product Management": "Product Management",
    },
    sectionCategory: {
      "Data Science, AI & Machine Learning": "DATA_SCIENCE",
      "Quantitative Finance": "DATA_SCIENCE",
      "Product Management": "OTHER",
    },
    columns: { company: 0, title: 1, location: 2, apply: 3 },
    minCells: 4,
    // Observed live 2026-08-12 (dry run): 106 + 71 + 24 = 201. Floor ~ half.
    minExpectedPostings: 100,
  },
  // speedyapply/2026-AI-College-Jobs — pipe-markdown, `###` h3 headers, no per-org config shape.
  // Skips "FAANG+" (heavy overlap with Simplify) and USA/International nav sections. "Other"
  // needs a title filter since it's not DS/quant-scoped like "Quant" is.
  {
    key: "speedyapply-ai",
    readmeUrl: "https://raw.githubusercontent.com/speedyapply/2026-AI-College-Jobs/main/README.md",
    tableFormat: "pipe",
    sectionHeaderRe: /^###\s+(.+?)\s*$/,
    sections: ["Quant", "Other"],
    sectionLabel: { Quant: "Quantitative Finance", Other: "Data Science, AI & Machine Learning" },
    sectionCategory: { Quant: "DATA_SCIENCE", Other: "DATA_SCIENCE" },
    // Column layout differs per section here (Quant has a Salary column, Other doesn't) — the
    // adapter's findApplyUrl searches for the `alt="Apply"` image signature across all cells
    // rather than trusting a single fixed index, so this apply index is only a fallback.
    columns: { company: 0, title: 1, location: 2, apply: 4, salary: 3 },
    minCells: 4,
    titleIncludeRe: /\b(data|machine learning|ml|ai|research|scientist|analyst|quant|statistic)\w*\b/i,
    // Observed live 2026-08-12 (dry run): Quant 34 + Other (post-filter) 113 = 147. Floor ~ half.
    minExpectedPostings: 70,
  },
  // vanshb03/New-Grad-2026 — flat pipe-markdown table, NO section headers at all. titleIncludeRe
  // is mandatory here (enforced by the adapter at fetch time) or this would dump ~1078 mostly-SWE
  // rows into one DS tab.
  {
    key: "vansh-new-grad",
    readmeUrl: "https://raw.githubusercontent.com/vanshb03/New-Grad-2026/main/README.md",
    tableFormat: "pipe",
    sectionHeaderRe: null,
    sections: [FLAT_SECTION],
    sectionLabel: { [FLAT_SECTION]: "Data Science, AI & Machine Learning" },
    sectionCategory: { [FLAT_SECTION]: "DATA_SCIENCE" },
    columns: { company: 0, title: 1, location: 2, apply: 3 },
    minCells: 4,
    titleIncludeRe:
      /\b(data scien|data analy|machine learning|\bml\b|research scientist|quantitative|quant\b|statistic|applied scien|decision scien)/i,
    titleExcludeRe: /\b(sales|recruit|marketing)\b/i,
    // Set EMPIRICALLY from a dry run (2026-08-12), not guessed: 108 rows matched the title
    // filter, 63 of those had a real (non-🔒-locked) apply href. Floor ~ half of 63.
    minExpectedPostings: 30,
  },
];
