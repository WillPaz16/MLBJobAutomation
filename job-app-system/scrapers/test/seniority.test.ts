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

  it("classifies entry-track (non-internship) titles as ENTRY", () => {
    expect(classifySeniority("Baseball Operations Coordinator")).toBe("ENTRY");
    expect(classifySeniority("Marketing Assistant")).toBe("ENTRY");
  });

  it("classifies internships as null, not ENTRY — isInternship is a separate axis", () => {
    expect(classifySeniority("Data Analyst Intern")).toBeNull();
    expect(classifySeniority("Software Engineering Internship")).toBeNull();
    expect(classifySeniority("Summer 2027 Marketing Co-op")).toBeNull();
  });

  it("an internship title with an earlier EXECUTIVE/SENIOR signal still wins that bucket", () => {
    expect(classifySeniority("Senior Fellow Program Intern")).toBe("SENIOR");
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
