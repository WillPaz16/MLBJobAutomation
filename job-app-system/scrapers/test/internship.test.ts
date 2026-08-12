import { describe, expect, it } from "vitest";
import { classifyIsInternship } from "../src/internship.js";

describe("classifyIsInternship", () => {
  it("classifies intern/internship/summer/co-op titles as true", () => {
    expect(classifyIsInternship("Software Engineering Intern")).toBe(true);
    expect(classifyIsInternship("Summer 2026 Internship")).toBe(true);
    expect(classifyIsInternship("Co-op - Data Science")).toBe(true);
    expect(classifyIsInternship("Data Analyst Co-op")).toBe(true);
  });

  it("classifies bare full-time titles as false", () => {
    expect(classifyIsInternship("Software Engineer")).toBe(false);
    expect(classifyIsInternship("New Grad Data Scientist")).toBe(false);
  });
});
