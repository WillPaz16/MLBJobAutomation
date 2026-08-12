import { describe, expect, it } from "vitest";
import { classifySeniority } from "../src/seniority.js";

describe("classifySeniority", () => {
  it("classifies VP/director/chief titles as EXECUTIVE", () => {
    expect(classifySeniority("VP of Baseball Operations")).toBe("EXECUTIVE");
    expect(classifySeniority("Director of Baseball Analytics")).toBe("EXECUTIVE");
    expect(classifySeniority("Chief Data Officer")).toBe("EXECUTIVE");
  });

  it("classifies senior/staff/principal/lead titles as SENIOR", () => {
    expect(classifySeniority("Senior Data Scientist")).toBe("SENIOR");
    expect(classifySeniority("Staff Software Engineer")).toBe("SENIOR");
    expect(classifySeniority("Lead Analyst")).toBe("SENIOR");
  });

  it("classifies intern/entry-track titles as ENTRY", () => {
    expect(classifySeniority("Data Analyst Intern")).toBe("ENTRY");
    expect(classifySeniority("Baseball Operations Coordinator")).toBe("ENTRY");
    expect(classifySeniority("Marketing Assistant")).toBe("ENTRY");
  });

  it("classifies 'new grad' phrasing as ENTRY", () => {
    expect(classifySeniority("Software Engineer New Grad")).toBe("ENTRY");
    expect(classifySeniority("Data Scientist, Early Career")).toBe("ENTRY");
    expect(classifySeniority("Software Engineer - University Grad Program")).toBe("ENTRY");
  });

  it("classifies a bare professional title with no level word as MID", () => {
    // "Data Analyst" alone implies a real professional IC role even without an explicit level
    // word, so it defaults to MID rather than null.
    expect(classifySeniority("Data Analyst")).toBe("MID");
    expect(classifySeniority("Software Engineer")).toBe("MID");
  });

  it("returns null for roles where seniority isn't a meaningful concept", () => {
    expect(classifySeniority("HVAC Technician")).toBeNull();
    expect(classifySeniority("Usher")).toBeNull();
    expect(classifySeniority("Plumber")).toBeNull();
    expect(classifySeniority("Grounds Crew")).toBeNull();
  });

  it("EXECUTIVE takes priority over other signals in the same title", () => {
    expect(classifySeniority("Director of Analytics")).toBe("EXECUTIVE");
  });
});
