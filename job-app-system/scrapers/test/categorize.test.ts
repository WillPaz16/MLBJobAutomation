import { describe, expect, it } from "vitest";
import { categorize } from "../src/categorize.js";

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
