// Config-driven source lists. Add new orgs here without touching adapter code.
// Every entry below was verified with a live curl against its actual API before being added —
// see the add-job-source skill for the verification steps to follow when adding more.

// Greenhouse: find an org's board token from their careers page URL: boards.greenhouse.io/<boardToken>.
export const greenhouseSources: { boardToken: string; organizationName: string }[] = [
  // MLB baseball ops/analytics-adjacent boards
  // Phillies run two separate Greenhouse boards — business ops returned 0 live jobs when
  // last checked (2026-08-11) but is kept since it's a real, distinct board that could post
  // again; baseball ops is where roles like "Quantitative Analyst Associate" actually show up.
  { boardToken: "philliesbusinessops", organizationName: "Philadelphia Phillies" },
  { boardToken: "philliesbaseballoperations", organizationName: "Philadelphia Phillies" },
  { boardToken: "clevelandguardiansbops", organizationName: "Cleveland Guardians" },
  { boardToken: "baltimoreorioles", organizationName: "Baltimore Orioles" },
  { boardToken: "athleticsbaseballops", organizationName: "Athletics" },
];

// Lever: find an org's site slug from their careers page URL: jobs.lever.co/<site>.
export const leverSources: { site: string; organizationName: string }[] = [
  { site: "redsox", organizationName: "Boston Red Sox" },
  { site: "sfgiants", organizationName: "San Francisco Giants" },
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

// SimplifyJobs/New-Grad-Positions (github.com/SimplifyJobs/New-Grad-Positions) — a community-
// maintained, actively-updated README tracking new-grad tech/DS/quant/PM roles across 50+
// companies. Replaces the 6 Greenhouse + 1 Lever "general data-science-heavy companies" sources
// above (FanDuel, Catapult Sports, Instacart, Robinhood, Airbnb, Coinbase, Palantir) — those were
// flooding Discovery with senior/staff-level and international roles that don't fit a new grad's
// search; this source is scoped to new-grad roles by construction. Section header text confirmed
// live via curl against the raw README (`dev` branch) — see newGradList.ts for the parsing
// contract (single multi-org fetch, not one-config-entry-per-org like every other adapter here).
// Single config object, not an array of per-org entries — this adapter has no per-org config
// shape (see newGradListAdapter's fetchPostings signature).
export const newGradListConfig: { sections: string[] } = {
  sections: ["Data Science, AI & Machine Learning", "Quantitative Finance", "Product Management"],
};
