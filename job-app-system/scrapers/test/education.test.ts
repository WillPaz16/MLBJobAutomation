import { describe, expect, it } from "vitest";
import { classifyEducationRequirement, EDUCATION_RANK } from "../src/education.js";

describe("classifyEducationRequirement", () => {
  it("classifies PhD requirements", () => {
    expect(classifyEducationRequirement("Research Scientist", "A PhD in Statistics is required.")).toBe("PHD");
    expect(classifyEducationRequirement("Research Scientist", "Doctorate in a quantitative field required.")).toBe(
      "PHD"
    );
    expect(classifyEducationRequirement("Research Scientist", "Doctoral degree preferred.")).toBe("PHD");
  });

  it("classifies Master's requirements", () => {
    expect(classifyEducationRequirement("Data Scientist", "Master's degree in Computer Science required.")).toBe(
      "MASTERS"
    );
    expect(classifyEducationRequirement("Data Scientist", "MBA required.")).toBe("MASTERS");
    expect(classifyEducationRequirement("Data Scientist", "M.S. in Statistics or related field required.")).toBe(
      "MASTERS"
    );
  });

  it("classifies Bachelor's requirements", () => {
    expect(classifyEducationRequirement("Data Analyst", "Bachelor's degree in a relevant field required.")).toBe(
      "BACHELORS"
    );
    expect(classifyEducationRequirement("Data Analyst", "BS/BA required.")).toBe("BACHELORS");
    expect(classifyEducationRequirement("Data Analyst", "Undergraduate degree required.")).toBe("BACHELORS");
    expect(classifyEducationRequirement("Data Analyst", "4-year degree required.")).toBe("BACHELORS");
  });

  it("classifies explicit no-degree-required signals as NONE", () => {
    expect(classifyEducationRequirement("Retail Associate", "High school diploma or GED required.")).toBe("NONE");
    expect(classifyEducationRequirement("Warehouse Associate", "No degree required for this role.")).toBe("NONE");
  });

  it("'Bachelor's required, Master's preferred' resolves to the MINIMUM (BACHELORS), not the highest mentioned", () => {
    expect(
      classifyEducationRequirement(
        "Data Scientist",
        "Bachelor's degree required, Master's degree preferred."
      )
    ).toBe("BACHELORS");
    expect(
      classifyEducationRequirement(
        "Data Scientist",
        "Bachelor's degree in a relevant field required (Master's a plus)."
      )
    ).toBe("BACHELORS");
  });

  it("'PhD preferred, Master's required' resolves to the MINIMUM (MASTERS), not the highest mentioned", () => {
    expect(
      classifyEducationRequirement("Research Scientist", "Master's degree required; PhD preferred.")
    ).toBe("MASTERS");
  });

  it("returns null when there's no education signal at all", () => {
    expect(classifyEducationRequirement("Ticket Sales Representative", "Great communication skills needed.")).toBe(
      null
    );
    expect(classifyEducationRequirement("Software Engineer")).toBe(null);
  });

  it("does not classify 'MS' as MASTERS when it's a Microsoft-product reference, not a degree", () => {
    expect(classifyEducationRequirement("IT Support Specialist", "Experience with MS SQL Server required.")).toBe(
      null
    );
    expect(classifyEducationRequirement("Administrative Assistant", "Proficiency with MS Office required.")).toBe(
      null
    );
    expect(classifyEducationRequirement("IT Support Specialist", "Familiarity with MS Excel and MS Teams.")).toBe(
      null
    );
  });
});

describe("EDUCATION_RANK", () => {
  it("orders levels low to high", () => {
    expect(EDUCATION_RANK.NONE).toBeLessThan(EDUCATION_RANK.BACHELORS);
    expect(EDUCATION_RANK.BACHELORS).toBeLessThan(EDUCATION_RANK.MASTERS);
    expect(EDUCATION_RANK.MASTERS).toBeLessThan(EDUCATION_RANK.PHD);
  });
});
