import { describe, expect, it } from "vitest";
import { categorize, isMlbOrg } from "../src/categorize.js";

describe("categorize", () => {
  it("classifies baseball R&D roles", () => {
    expect(categorize("Baseball R&D Analyst", "Chicago Cubs")).toBe("BASEBALL_RND");
    expect(categorize("Biomechanics Researcher", "Los Angeles Dodgers")).toBe("BASEBALL_RND");
  });

  it("classifies baseball analytics roles", () => {
    expect(categorize("Baseball Analytics Fellow", "Cleveland Guardians")).toBe("BASEBALL_ANALYTICS");
    expect(categorize("Quantitative Analyst, Player Development", "Tampa Bay Rays")).toBe(
      "BASEBALL_ANALYTICS"
    );
  });

  it("classifies baseball ops roles", () => {
    expect(categorize("Baseball Operations Coordinator", "Atlanta Braves")).toBe("BASEBALL_OPS");
    expect(categorize("Pro Scouting Assistant", "Baltimore Orioles")).toBe("BASEBALL_OPS");
  });

  it("falls back to OTHER for a baseball org role matching none of the specific department regexes", () => {
    // Previously fell through to an unconditional BASEBALL_OPS default — that buried the
    // BASEBALL_OPS tag under generic team-support roles (ushers, ticket sales, security, retail).
    expect(categorize("Guest Services Associate", "Atlanta Braves")).toBe("OTHER");
    expect(categorize("Usher", "Kansas City Royals")).toBe("OTHER");
    expect(categorize("Security Patrol Officer I", "Arizona Diamondbacks")).toBe("OTHER");
    expect(categorize("Ticket Sales Associate", "Boston Red Sox")).toBe("OTHER");
  });

  it("does not misclassify a business-development role as R&D just because it shares 'development'", () => {
    // No positive department signal beyond "development" (deliberately excluded from the R&D
    // check) — falls to OTHER rather than being force-fit into BASEBALL_RND or BASEBALL_OPS.
    expect(categorize("Director, Business Development", "Atlanta Braves")).toBe("OTHER");
  });

  it("classifies non-baseball data science roles", () => {
    expect(categorize("Senior Data Scientist", "Instacart")).toBe("DATA_SCIENCE");
    expect(categorize("Machine Learning Engineer", "Robinhood")).toBe("DATA_SCIENCE");
  });

  it("falls back to OTHER for unrelated non-baseball roles", () => {
    expect(categorize("Retail Truck Driver", "Some Warehouse Co")).toBe("OTHER");
    expect(categorize("Sales Associate", "Random Company")).toBe("OTHER");
  });

  it("buckets a non-role warehouse/retail posting at a baseball org's subsidiary as OTHER", () => {
    // Org-name matching is intentionally broad (any hint substring counts as a baseball org), but
    // that no longer forces an unrelated retail role into BASEBALL_OPS — it lands in OTHER like
    // any other baseball-org posting with no positive department signal.
    expect(categorize("Retail Truck Driver", "Atlanta Braves Team Store LLC")).toBe("OTHER");
  });

  it("is case-insensitive", () => {
    expect(categorize("DATA SCIENTIST", "SOME COMPANY")).toBe("DATA_SCIENCE");
  });

  it("does not misclassify a role as DATA_SCIENCE just because the company's boilerplate description mentions data/analytics", () => {
    // Real case: Clover Health/Flatiron Health (health-data companies) mention "data" and
    // "analytics" in their company-description boilerplate on every posting, which previously
    // tagged "Medical Assistant" and "Buyer" as DATA_SCIENCE. The DATA_SCIENCE check is title-only
    // for exactly this reason — description text is company marketing, not a role signal.
    expect(
      categorize(
        "Medical Assistant",
        "Clover Health",
        "Clover Health is a data-driven healthcare company using analytics to transform patient care."
      )
    ).toBe("OTHER");
    expect(
      categorize(
        "Buyer",
        "Flatiron Health",
        "Flatiron Health leverages real-world data and analytics to accelerate cancer research."
      )
    ).toBe("OTHER");
  });

  it("still classifies a real data-science role by title even with the same kind of company boilerplate", () => {
    expect(
      categorize(
        "Data Analyst, Clinical Data Effectiveness",
        "Clover Health",
        "Clover Health is a data-driven healthcare company."
      )
    ).toBe("DATA_SCIENCE");
  });

  it("uses the description to classify a title that gives no signal on its own", () => {
    // Real case: a UKG posting titled "Junior Product Designer" whose description says it's
    // on the Dodgers' Baseball Research and Development team — title alone gives BASEBALL_OPS.
    expect(
      categorize(
        "Junior Product Designer",
        "Los Angeles Dodgers",
        "The Baseball Research and Development team of the Los Angeles Dodgers is dedicated to..."
      )
    ).toBe("BASEBALL_RND");
    expect(categorize("Junior Product Designer", "Los Angeles Dodgers")).toBe("OTHER");
  });
});

describe("isMlbOrg", () => {
  it("matches known MLB org names/nicknames", () => {
    expect(isMlbOrg("Boston Red Sox")).toBe(true);
    expect(isMlbOrg("Cincinnati Reds")).toBe(true);
  });

  it("does not match unrelated companies", () => {
    expect(isMlbOrg("Airbnb")).toBe(false);
    expect(isMlbOrg("PathAI")).toBe(false);
  });

  it("does not false-positive on words that merely contain a hint as a substring of a different word", () => {
    // "guardian life insurance" does not contain "guardians" (no trailing s), and "angel
    // studios" does not contain "angels" (no trailing s) — both correctly don't match.
    expect("guardian life insurance".includes("guardians")).toBe(false);
    expect(isMlbOrg("Guardian Life Insurance")).toBe(false);
    expect("angel studios".includes("angels")).toBe(false);
    expect(isMlbOrg("Angel Studios")).toBe(false);
  });

  it("only checks the organization string, not title/description", () => {
    // A non-baseball org's role can mention a team name in its title without the org itself
    // being that team.
    expect(isMlbOrg("Some Warehouse Co")).toBe(false);
  });

  it("has known false-positive risk on generic team nicknames that are also common words/company-name fragments", () => {
    // Spot-checked systematically: "rangers", "braves", and "athletics" are broad enough hints
    // that they match organizations that aren't the actual MLB team, e.g. a company literally
    // named using that word. This is a known, accepted tradeoff of substring-based org
    // matching (same tradeoff categorize() already accepts for its own haystack match) — not a
    // bug to fix here, just documented risk.
    expect(isMlbOrg("Rangers Applied Sciences")).toBe(true);
    expect(isMlbOrg("Braves Trust")).toBe(true);
    expect(isMlbOrg("Athletics Corp")).toBe(true);
  });
});
