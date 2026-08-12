import { describe, expect, it } from "vitest";
import { computeFitScore, countSkillMatches, fitTier } from "../src/fitScore.js";

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

  it("does not match a bare single-character skill inside 'R&D' (single-char lookahead guard)", () => {
    const rndPosting = { title: "Director of R&D", organization: "Cubs" };
    const result = computeFitScore(rndPosting, { skills: "r" });
    expect(result.matchedSkills).toEqual([]);
    expect(countSkillMatches("Director of R&D", "r")).toBe(0);
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

  it("scores a Mets-shaped Baseball Analytics data scientist role high (top role tier + saturated core skill matches)", () => {
    // The formula's theoretical ceiling is roleSignal(42) + titlePoints(<12) + descPoints(<22) +
    // locationSignal(6) — a strongly-matching real posting should land well up in that range, not
    // hardcoded to the plan's illustrative example (the exact regex wording here may differ
    // slightly from the plan's).
    const profile = {
      coreSkills: "python, sql, statistics",
      skills: "modeling, baseball",
      locationKeywords: "new york",
    };

    const posting = {
      title: "Senior Data Scientist, Baseball Analytics — Python, SQL, Statistics",
      organization: "New York Mets",
      category: "BASEBALL_RND",
      location: "New York, NY",
      description:
        "Use Python and SQL and statistics to build statistical models for player development. " +
        "Python python python python python. Sql sql sql sql sql. Statistics statistics statistics statistics statistics.",
    };

    const result = computeFitScore(posting, profile);
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("separates a real R&D analyst role from a same-org Accounting Manager role", () => {
    const profile = {
      coreSkills: "python, sql, statistics",
      skills: "modeling, baseball",
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

    expect(rnd.score).toBeGreaterThan(accounting.score);
    expect(accounting.score).toBeLessThanOrEqual(20);
  });

  it("graduated role tiers: a title matching only the lowest tier scores lower than one matching the highest tier, all else equal", () => {
    const lowTierPosting = { title: "Coordinator", organization: "Cubs" };
    const highTierPosting = { title: "Data Scientist", organization: "Cubs" };
    const profile = { skills: "" };

    const low = computeFitScore(lowTierPosting, profile);
    const high = computeFitScore(highTierPosting, profile);
    expect(high.score).toBeGreaterThan(low.score);
  });

  it("frequency-damps description matches: six mentions score higher than one, and six equals eight (the cap)", () => {
    const profile = { skills: "python" };
    const one = computeFitScore(
      { title: "Analyst", organization: "Cubs", description: "python" },
      profile
    );
    const six = computeFitScore(
      { title: "Analyst", organization: "Cubs", description: "python python python python python python" },
      profile
    );
    const eight = computeFitScore(
      {
        title: "Analyst",
        organization: "Cubs",
        description: "python python python python python python python python",
      },
      profile
    );
    expect(six.score).toBeGreaterThan(one.score);
    expect(eight.score).toBe(six.score);
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
      { coreSkills: "baseball, analytics", locationKeywords: "chicago" }
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
      { coreSkills: "python", locationKeywords: "chicago", skills: "" }
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

describe("countSkillMatches", () => {
  it("counts word-boundary matches, shared with the scorer's own matching logic", () => {
    expect(countSkillMatches("python python python", "python")).toBe(3);
    expect(countSkillMatches("Director of R&D", "r")).toBe(0);
    expect(countSkillMatches("Use R for stats", "r")).toBe(1);
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
