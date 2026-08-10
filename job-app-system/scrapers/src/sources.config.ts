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

// Team career pages not on Greenhouse/Lever/Workday. Validate selectors against the live
// page before adding an entry here — see teamPage.ts adapter docs for the config contract.
export const teamPageSources: {
  organizationName: string;
  listUrl: string;
  cardSelector: string;
  titleSelector: string;
  linkSelector: string;
  locationSelector?: string;
}[] = [];

// Confirmed NOT to have a scrapable public API (Teamwork Online only, or a different vendor
// ATS that doesn't expose a public JSON endpoint) — recorded here so future sessions don't
// re-research the same dead ends: Yankees, Dodgers, Astros, Angels, Marlins, Nationals,
// Pirates, Reds, Brewers, Royals, White Sox, Twins, Rockies (UKG), Diamondbacks, Cardinals
// (aaimtrack.com), Blue Jays (routed through jobs.rogers.com, unconfirmed), San Francisco
// Giants (boardToken guess 404'd — real token not identified).
