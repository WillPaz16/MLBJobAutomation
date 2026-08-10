// Config-driven source lists. Add new orgs here without touching adapter code.
// Every entry below was verified with a live curl against its actual API before being added —
// see the add-job-source skill for the verification steps to follow when adding more.

// Greenhouse: find an org's board token from their careers page URL: boards.greenhouse.io/<boardToken>.
export const greenhouseSources: { boardToken: string; organizationName: string }[] = [
  // MLB baseball ops/analytics-adjacent boards
  { boardToken: "philliesbusinessops", organizationName: "Philadelphia Phillies" },
  { boardToken: "clevelandguardiansbops", organizationName: "Cleveland Guardians" },
  { boardToken: "baltimoreorioles", organizationName: "Baltimore Orioles" },
  { boardToken: "athleticsbaseballops", organizationName: "Athletics" },
  // General data-science-heavy companies
  { boardToken: "fanduel", organizationName: "FanDuel" },
  { boardToken: "catapultsports", organizationName: "Catapult Sports" },
  { boardToken: "instacart", organizationName: "Instacart" },
  { boardToken: "robinhood", organizationName: "Robinhood" },
  { boardToken: "airbnb", organizationName: "Airbnb" },
  { boardToken: "coinbase", organizationName: "Coinbase" },
];

// Lever: find an org's site slug from their careers page URL: jobs.lever.co/<site>.
export const leverSources: { site: string; organizationName: string }[] = [
  { site: "redsox", organizationName: "Boston Red Sox" },
  { site: "sfgiants", organizationName: "San Francisco Giants" },
  { site: "palantir", organizationName: "Palantir" },
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
  },
  {
    organizationName: "Minnesota Twins",
    listUrl: "https://recruitingbypaycor.com/career/CareerHome.action?clientId=8a7883d08b729b3e018b72dc67f6007f",
    cardSelector: ".gnewtonCareerGroupRowClass",
    titleSelector: ".gnewtonCareerGroupJobTitleClass a",
    linkSelector: ".gnewtonCareerGroupJobTitleClass a",
    locationSelector: ".gnewtonCareerGroupJobDescriptionClass",
  },
];

// Confirmed NOT to have a scrapable source — re-verified live (not carried over from stale
// research). Only 2 of 30 MLB teams land here now:
//   Kansas City Royals / Arizona Diamondbacks — Dayforce HCM (jobs.dayforcehcm.com). Has a real
//     JSON API (POST /api/geo/<tenant>/jobposting/search, confirmed via browser network capture),
//     but every request — even one replayed from inside the live page's own JS console with
//     matching cookies/origin — gets a 403 "Forbidden", while only genuine page-navigation-
//     triggered requests succeed. That pattern (works for real navigation, fails for any scripted
//     replay even from the same session) reads as active anti-automation fingerprinting, not a
//     missing field. Also confirmed: the Dayforce candidate portal is a client-rendered Next.js
//     SPA with no server-rendered JobPosting structured data and no real RSS/XML feed (a `.rss`
//     path just 200s the same SPA shell) — so there's no static-content workaround either, only
//     the blocked API. Treated the same as active bot detection and not pursued further.
//
// The honest way to close the Royals/Diamondbacks gap is the manual flow
// (`POST /api/postings/manual`, "Add posting manually" on Discovery), not more scraping attempts.
//
// Yankees/Rays (ADP), Dodgers/Pirates/Rockies/Astros/Angels/Nationals/White Sox (UKG), Toronto
// Blue Jays (BambooHR), and Brewers/Padres/Twins (teamPageAdapter, Playwright DOM scrape — none
// of these three had a JSON API, but none had active bot detection either) were all previously
// miscategorized as dead ends. Cardinals (aaimtrack.com) turned out to have a genuine, undocumented
// but plain public JSON API — no auth needed, just an unusual `?getParams=<url-encoded JSON>`
// query shape found via browser network capture. Marlins/Reds — long assumed to be blocked by
// Cloudflare like TeamWork Online's own generic job search — turned out to be plain server-rendered
// HTML on their *team-specific* career pages (teamworkonline.com/baseball-jobs/<org>) when fetched
// with a normal browser User-Agent: no challenge page, no JS required, and each posting embeds a
// clean schema.org JobPosting JSON-LD block. The earlier "Teamwork Online = blocked" conclusion
// was true for the platform's generic cross-org search UI but not for these per-team pages — worth
// remembering when re-checking any site previously written off wholesale. Keep re-checking any
// remaining team the same way (find the org's actual outbound "Apply" redirect rather than trusting
// an mlb.com page that never links off-platform, and try a plain fetch with a real User-Agent
// before assuming Playwright or an internal API is required), and remember: no JSON API ≠ dead
// end, and "blocked" on one page of a platform ≠ blocked on all of it — only active bot detection
// against the specific page you need is.
