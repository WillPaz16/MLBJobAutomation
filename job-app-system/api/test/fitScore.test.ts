import { describe, expect, it } from "vitest";
import { computeFitScore } from "../src/fitScore.js";

describe("computeFitScore", () => {
  it("matches skills found in the title/organization/description haystack", () => {
    const result = computeFitScore(
      {
        title: "Baseball Analytics Fellow",
        organization: "Chicago Cubs",
        category: "BASEBALL_ANALYTICS",
        location: "Chicago, IL",
        description: "Work with SQL and Python on evaluation models.",
      },
      { skills: "python, sql, golang" }
    );
    expect(result.matchedSkills.sort()).toEqual(["python", "sql"]);
    // 2 of 3 skills matched -> 66.67, rounds to 67
    expect(result.score).toBe(67);
  });

  it("adds a +15 bonus when the posting's category is in preferredCategories", () => {
    const base = computeFitScore(
      { title: "Data Scientist", organization: "Cubs", category: "DATA_SCIENCE" },
      { skills: "python" }
    );
    const withBonus = computeFitScore(
      { title: "Data Scientist", organization: "Cubs", category: "DATA_SCIENCE" },
      { skills: "python", preferredCategories: "data_science" }
    );
    expect(withBonus.score).toBe(base.score + 15);
  });

  it("adds a +10 bonus when a locationKeyword substring-matches the posting location", () => {
    const base = computeFitScore(
      { title: "Data Scientist", organization: "Cubs", location: "Chicago, IL" },
      { skills: "python" }
    );
    const withBonus = computeFitScore(
      { title: "Data Scientist", organization: "Cubs", location: "Chicago, IL" },
      { skills: "python", locationKeywords: "chicago" }
    );
    expect(withBonus.score).toBe(base.score + 10);
  });

  it("subtracts 20 per matched exclude keyword", () => {
    const result = computeFitScore(
      { title: "Ticket Sales Associate", organization: "Cubs", description: "internship role" },
      { skills: "sales", excludeKeywords: "internship" }
    );
    // sales matches (100 base) minus 20 for internship exclude hit = 80
    expect(result.score).toBe(80);
  });

  it("clamps the final score to [0, 100]", () => {
    const low = computeFitScore(
      { title: "Usher", organization: "Cubs", description: "internship internship" },
      { skills: "python", excludeKeywords: "internship" }
    );
    expect(low.score).toBe(0);

    const high = computeFitScore(
      { title: "Baseball Analytics", organization: "Cubs", category: "BASEBALL_ANALYTICS", location: "Chicago" },
      { skills: "baseball, analytics", preferredCategories: "baseball_analytics", locationKeywords: "chicago" }
    );
    expect(high.score).toBeLessThanOrEqual(100);
  });

  it("returns 0 score with no matches and an empty matchedSkills array", () => {
    const result = computeFitScore(
      { title: "Usher", organization: "Cubs" },
      { skills: "python, sql" }
    );
    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
  });
});
