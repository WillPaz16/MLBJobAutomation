import { describe, expect, it } from "vitest";
import { computeFitScore, fitTier } from "../src/fitScore.js";

describe("computeFitScore", () => {
  it("is independent of profile size — adding unmatched secondary skills never changes the score", () => {
    const posting = {
      title: "Data Engineer",
      organization: "Cubs",
      description: "Work with SQL pipelines.",
    };
    const small = computeFitScore(posting, { coreSkills: "python", skills: "sql" });
    const padding = Array.from({ length: 26 }, (_, i) => `noise-term-${i}`).join(", ");
    const big = computeFitScore(posting, { coreSkills: "python", skills: `sql, ${padding}` });
    expect(big.score).toBe(small.score);
  });

  it("uses word-boundary matching, not substring matching", () => {
    const researchPosting = { title: "Director of Research", organization: "Cubs" };
    const noMatch = computeFitScore(researchPosting, { skills: "r" });
    expect(noMatch.matchedSkills).toEqual([]);

    const rShinyPosting = {
      title: "Analyst",
      organization: "Cubs",
      description: "Build R Shiny dashboards for the front office.",
    };
    const match = computeFitScore(rShinyPosting, { skills: "r shiny" });
    expect(match.matchedSkills).toEqual(["r shiny"]);
  });

  it("escapes regex metacharacters in skill terms instead of throwing or matching as regex", () => {
    const posting = {
      title: "Software Engineer",
      organization: "Cubs",
      description: "Experience with c++ and other stuff+ preferred.",
    };
    expect(() => computeFitScore(posting, { skills: "stuff+, c++" })).not.toThrow();
    const result = computeFitScore(posting, { skills: "stuff+, c++" });
    expect(result.matchedSkills.sort()).toEqual(["c++", "stuff+"]);
  });

  it("separates a real R&D analyst role from a same-org Accounting Manager role", () => {
    const profile = {
      coreSkills: "python, sql, statistics",
      skills: "modeling, baseball",
      preferredCategories: "baseball_rnd",
    };

    const rndPosting = {
      title: "Analyst, Player Development – Research and Development",
      organization: "Kansas City Royals",
      category: "BASEBALL_RND",
      description: "Use Python and SQL to build statistical models for player development.",
    };
    const accountingPosting = {
      title: "Accounting Manager",
      organization: "Kansas City Royals",
      category: "OTHER",
      description: "Oversee the general ledger and monthly close process.",
    };

    const rnd = computeFitScore(rndPosting, profile);
    const accounting = computeFitScore(accountingPosting, profile);

    expect(rnd.score).toBeGreaterThanOrEqual(60);
    expect(accounting.score).toBeLessThanOrEqual(15);
  });

  it("skill contribution is monotonically non-decreasing as more skills match", () => {
    const posting = {
      title: "Baseball Analyst",
      organization: "Cubs",
      description: "python sql machine learning statistics modeling analytics",
    };
    const scores: number[] = [];
    const skillSets = [
      "python",
      "python, sql",
      "python, sql, statistics",
      "python, sql, statistics, modeling",
    ];
    for (const skills of skillSets) {
      scores.push(computeFitScore(posting, { skills }).score);
    }
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    }
  });

  it("clamps the final score to [0, 100]", () => {
    const low = computeFitScore(
      { title: "Usher", organization: "Cubs", description: "internship internship internship internship" },
      { skills: "python", excludeKeywords: "internship" }
    );
    expect(low.score).toBe(0);

    const high = computeFitScore(
      { title: "Baseball Analyst", organization: "Cubs", category: "BASEBALL_RND", location: "Chicago" },
      { coreSkills: "baseball, analytics", preferredCategories: "baseball_rnd", locationKeywords: "chicago" }
    );
    expect(high.score).toBeLessThanOrEqual(100);
  });

  it("returns reasons and evidence arrays with the right shape", () => {
    const result = computeFitScore(
      {
        title: "Baseball Analyst",
        organization: "Cubs",
        category: "BASEBALL_RND",
        location: "Chicago",
        description: "Use python for statistical modeling.",
      },
      { coreSkills: "python", preferredCategories: "baseball_rnd", locationKeywords: "chicago", skills: "" }
    );
    expect(Array.isArray(result.reasons)).toBe(true);
    for (const reason of result.reasons) {
      expect(reason).toHaveProperty("kind");
      expect(reason).toHaveProperty("label");
      expect(reason).toHaveProperty("points");
    }
    expect(Array.isArray(result.evidence)).toBe(true);
    for (const ev of result.evidence) {
      expect(ev).toHaveProperty("term");
      expect(ev).toHaveProperty("excerpt");
    }
    expect(result.tier).toBe(fitTier(result.score));
  });

  it("returns 0 score with no matches and an empty matchedSkills array", () => {
    const result = computeFitScore({ title: "Usher", organization: "Cubs" }, { skills: "python, sql" });
    expect(result.score).toBe(0);
    expect(result.matchedSkills).toEqual([]);
  });
});

describe("fitTier", () => {
  it("maps boundary scores to the correct tier", () => {
    expect(fitTier(65)).toBe("Strong");
    expect(fitTier(64)).toBe("Good");
    expect(fitTier(40)).toBe("Good");
    expect(fitTier(39)).toBe("Fair");
    expect(fitTier(20)).toBe("Fair");
    expect(fitTier(19)).toBe("Weak");
  });
});
