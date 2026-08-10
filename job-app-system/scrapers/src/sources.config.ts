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
];

// Confirmed NOT to have a scrapable public JSON API — re-verified live (not carried over from
// stale research), each tagged with its real platform so a future session doesn't waste time
// re-checking these or reaching for a workaround. 8 of 30 MLB teams land here; the honest way
// to cover them in the tracker is the manual "add posting by URL" flow (POST /api/postings/manual),
// not more scraping attempts:
//   Teamwork Online / Indeed only (no public API, confirmed by direct apply-flow check): Marlins, Reds
//   Milwaukee Brewers — iCIMS, server-rendered HTML nested in iframes (careers-brewers.icims.com).
//     No JSON API found; a genuine candidate for the teamPageAdapter (Playwright) if ever built out —
//     not a bot-detection wall, just needs real browser rendering + iframe traversal.
//   Kansas City Royals / Arizona Diamondbacks — Dayforce HCM (jobs.dayforcehcm.com). Has a real
//     JSON API (POST /api/geo/<tenant>/jobposting/search, confirmed via browser network capture)
//     but returns 403 on every request-body shape tried without full devtools payload capture —
//     needs a session with real devtools access to capture the exact required request shape
//     (likely a required header or exact field set) before it's worth an adapter.
//   Minnesota Twins — Paycor (recruitingbypaycor.com/recruitingbypaycor's API returned 401
//     Unauthorized, requires a JWT — not a public API).
//   St. Louis Cardinals — aaimtrack.com (Vue SPA, client-rendered; no JSON API found at the
//     obvious endpoint — would need browser network capture like Dayforce to find the real one).
//   San Diego Padres — Hireology (careers.hireology.com/sandiegopadres; guessed API endpoint
//     404'd — same treatment as Cardinals/aaimtrack would be needed).
//
// Yankees/Rays (ADP), Dodgers/Pirates/Rockies/Astros/Angels/Nationals/White Sox (UKG), and
// Toronto Blue Jays (BambooHR) were previously miscategorized as dead ends — corrected once Will
// found real career-center links and we found their actual public APIs. Keep re-checking any
// remaining "Teamwork Online only" team the same way (find the org's actual outbound "Apply"
// redirect rather than trusting an mlb.com page that never links off-platform).
