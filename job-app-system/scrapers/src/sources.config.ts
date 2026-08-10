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
];

// Team career pages not on Greenhouse/Lever/Workday/ADP/UKG. Validate selectors against the
// live page before adding an entry here — see teamPage.ts adapter docs for the config contract.
export const teamPageSources: {
  organizationName: string;
  listUrl: string;
  cardSelector: string;
  titleSelector: string;
  linkSelector: string;
  locationSelector?: string;
}[] = [];

// Confirmed NOT to have a scrapable public API — re-verified live (not carried over from
// stale research), each tagged with its real platform so a future session doesn't waste time
// re-checking these or reaching for a workaround. 14 of 30 MLB teams land here; the honest way
// to cover them in the tracker is the manual "add posting by URL" flow (POST /api/postings/manual),
// not more scraping — none of these expose a public JSON job-search API to hit directly:
//   Teamwork Online only (no public API): Astros, Angels, Marlins, Nationals, Reds, Brewers,
//     Royals, White Sox, Diamondbacks, Rays
//   Minnesota Twins — Paycor (recruitingbypaycor.com)
//   St. Louis Cardinals — aaimtrack.com (tenant stlcardinals)
//   Toronto Blue Jays — SAP SuccessFactors, via jobs.rogers.com
//   San Diego Padres — Hireology (careers.hireology.com/sandiegopadres)
//
// Yankees (ADP), Dodgers/Pirates/Rockies (UKG) were previously miscategorized as dead ends —
// corrected once Will found real career-center links and we found their actual public APIs.
// Worth re-checking any remaining "Teamwork Online only" team the same way (find the org's
// actual outbound "Apply" redirect rather than trusting an mlb.com page never links off-platform).
