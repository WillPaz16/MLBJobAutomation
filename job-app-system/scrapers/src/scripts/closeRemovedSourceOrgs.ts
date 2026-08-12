import { prisma } from "../db.js";

// One-off cleanup: Airbnb/Coinbase/Instacart/Robinhood/FanDuel/Catapult Sports (Greenhouse) and
// Palantir (Lever) were removed from sources.config.ts in favor of the new-grad-list source, but
// removing a config entry doesn't close its existing postings — the active/inactive tracking in
// ingest.ts only fires when a scrape actually runs for that (sourceId, organization) and misses a
// posting, which never happens once the org is gone from config. Left alone, these ~860 rows
// (confirmed via a live DB check to have zero linked Applications) would sit as permanently
// "active" and fall outside every Discovery tab (not isMlbTeam, no sourceSection). Closing them
// (not deleting) matches the existing closedAt semantics used for scraper-detected closures.
const REMOVED_ORGS = ["Airbnb", "Coinbase", "Instacart", "Robinhood", "FanDuel", "Catapult Sports", "Palantir"];

async function main() {
  const result = await prisma.posting.updateMany({
    where: { organization: { in: REMOVED_ORGS }, closedAt: null },
    data: { closedAt: new Date() },
  });

  console.log(`Closed ${result.count} postings from removed sources: ${REMOVED_ORGS.join(", ")}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
