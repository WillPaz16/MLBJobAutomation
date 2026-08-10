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

  it("falls back to BASEBALL_OPS for a baseball org role matching none of the specific regexes", () => {
    expect(categorize("Guest Services Associate", "Atlanta Braves")).toBe("BASEBALL_OPS");
  });

  it("does not misclassify a business-development role as R&D just because it shares 'development'", () => {
    expect(categorize("Director, Business Development", "Atlanta Braves")).toBe("BASEBALL_OPS");
  });

  it("classifies non-baseball data science roles", () => {
    expect(categorize("Senior Data Scientist", "Instacart")).toBe("DATA_SCIENCE");
    expect(categorize("Machine Learning Engineer", "Robinhood")).toBe("DATA_SCIENCE");
  });

  it("falls back to OTHER for unrelated non-baseball roles", () => {
    expect(categorize("Retail Truck Driver", "Some Warehouse Co")).toBe("OTHER");
    expect(categorize("Sales Associate", "Random Company")).toBe("OTHER");
  });

  it("still buckets a non-role warehouse/retail posting at a baseball org as BASEBALL_OPS", () => {
    // Org-name matching is intentionally broad (any hint substring counts as a baseball org),
    // so an unrelated retail role at a team's merch subsidiary still lands in the OPS catch-all
    // rather than OTHER — documents that tradeoff explicitly.
    expect(categorize("Retail Truck Driver", "Atlanta Braves Team Store LLC")).toBe("BASEBALL_OPS");
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
    expect(categorize("Junior Product Designer", "Los Angeles Dodgers")).toBe("BASEBALL_OPS");
  });
});
