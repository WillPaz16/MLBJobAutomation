import { describe, expect, it } from "vitest";
import { classifyRegion, classifyWorkMode } from "../src/location.js";

// Cases drawn from the real, live `location` values in api/data/jobs.db (see the task notes for
// the full frequency sample) — not invented examples.
describe("classifyWorkMode", () => {
  it("classifies 'Remote - USA' as REMOTE", () => {
    expect(classifyWorkMode("Remote - USA")).toBe("REMOTE");
  });

  it("classifies 'Canada - Remote (ON, AB, BC, or NS Only)' as REMOTE", () => {
    expect(classifyWorkMode("Canada - Remote (ON, AB, BC, or NS Only)")).toBe("REMOTE");
  });

  it("classifies 'Remote - India' as REMOTE", () => {
    expect(classifyWorkMode("Remote - India")).toBe("REMOTE");
  });

  it("classifies 'New York, NY' as ONSITE", () => {
    expect(classifyWorkMode("New York, NY")).toBe("ONSITE");
  });

  it("classifies 'London, United Kingdom' as ONSITE", () => {
    expect(classifyWorkMode("London, United Kingdom")).toBe("ONSITE");
  });

  it("classifies 'Tokyo, Japan' as ONSITE", () => {
    expect(classifyWorkMode("Tokyo, Japan")).toBe("ONSITE");
  });

  it("classifies 'US-WI-Milwaukee' (dash format) as ONSITE", () => {
    expect(classifyWorkMode("US-WI-Milwaukee")).toBe("ONSITE");
  });

  it("classifies 'LECOM Park' (venue name, no geographic info) as null", () => {
    expect(classifyWorkMode("LECOM Park")).toBeNull();
  });

  it("classifies 'Houston Recruiting' (department name) as null", () => {
    expect(classifyWorkMode("Houston Recruiting")).toBeNull();
  });

  it("picks up HYBRID from description when location alone doesn't say so", () => {
    expect(classifyWorkMode("New York, NY", "This is a hybrid role, 3 days in office.")).toBe("HYBRID");
  });

  it("classifies 'Hybrid - London, UK' as HYBRID from location alone", () => {
    expect(classifyWorkMode("Hybrid - London, UK")).toBe("HYBRID");
  });

  it("returns null for a null location", () => {
    expect(classifyWorkMode(null)).toBeNull();
  });
});

describe("classifyRegion", () => {
  it("classifies 'Remote - USA' as USA", () => {
    expect(classifyRegion("Remote - USA")).toBe("USA");
  });

  it("classifies 'Canada - Remote (ON, AB, BC, or NS Only)' as INTERNATIONAL, not falsely USA via the ON/AB/BC/NS state-abbreviation trap", () => {
    expect(classifyRegion("Canada - Remote (ON, AB, BC, or NS Only)")).toBe("INTERNATIONAL");
  });

  it("classifies 'Remote - India' as INTERNATIONAL", () => {
    expect(classifyRegion("Remote - India")).toBe("INTERNATIONAL");
  });

  it("classifies 'New York, NY' as USA", () => {
    expect(classifyRegion("New York, NY")).toBe("USA");
  });

  it("classifies 'London, United Kingdom' as INTERNATIONAL", () => {
    expect(classifyRegion("London, United Kingdom")).toBe("INTERNATIONAL");
  });

  it("classifies 'Tokyo, Japan' as INTERNATIONAL", () => {
    expect(classifyRegion("Tokyo, Japan")).toBe("INTERNATIONAL");
  });

  it("classifies 'LECOM Park' as null", () => {
    expect(classifyRegion("LECOM Park")).toBeNull();
  });

  it("classifies 'Houston Recruiting' as null", () => {
    expect(classifyRegion("Houston Recruiting")).toBeNull();
  });

  it("classifies 'US-WI-Milwaukee' (dash format) as USA", () => {
    expect(classifyRegion("US-WI-Milwaukee")).toBe("USA");
  });

  it("classifies a multi-location string that's entirely USA as USA", () => {
    expect(classifyRegion("Menlo Park, CA; New York, NY")).toBe("USA");
  });

  it("classifies a hypothetical mixed-region multi-location string as null (ambiguous)", () => {
    expect(classifyRegion("Menlo Park, CA; London, UK")).toBeNull();
  });

  it("classifies 'United States' as USA", () => {
    expect(classifyRegion("United States")).toBe("USA");
  });

  it("classifies 'Toronto, Canada' as INTERNATIONAL", () => {
    expect(classifyRegion("Toronto, Canada")).toBe("INTERNATIONAL");
  });

  it("returns null for a null location", () => {
    expect(classifyRegion(null)).toBeNull();
  });
});
