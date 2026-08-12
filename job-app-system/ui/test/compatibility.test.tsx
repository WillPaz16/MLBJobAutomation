import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Compatibility } from "../src/pages/Compatibility";

const { profileCoverage } = vi.hoisted(() => ({ profileCoverage: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../src/api/client", () => ({
  api: {
    profile: {
      get: vi.fn().mockResolvedValue({
        id: "profile",
        skills: "sql, plotly",
        coreSkills: "python",
        preferredCategories: null,
        locationKeywords: null,
        excludeKeywords: null,
        updatedAt: new Date().toISOString(),
      }),
      update: vi.fn(),
      coverage: profileCoverage,
      previewCoverage: vi.fn(),
    },
    resumeBullets: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Compatibility coverage surfacing", () => {
  it("shows the matched-skill summary line and flags zero-match skills", async () => {
    profileCoverage.mockResolvedValue({
      totalPostings: 10,
      skills: [
        { term: "python", tier: "core", postings: 5, occurrences: 12 },
        { term: "sql", tier: "secondary", postings: 2, occurrences: 3 },
        { term: "plotly", tier: "secondary", postings: 0, occurrences: 0 },
      ],
      fitScores: [10, 20, 30],
      tierCounts: { Strong: 1, Good: 1, Fair: 1, Weak: 0 },
      categoryActivity: [],
      calibration: { dismissedAvg: 12, dismissedCount: 3, appliedAvg: 55, appliedCount: 2 },
    });

    render(<Compatibility />);

    await waitFor(() => expect(screen.getByText(/2 of 3 skills match at least one posting/)).toBeInTheDocument());
    expect(screen.getByText("plotly")).toBeInTheDocument();
    expect(screen.getByText(/dismissed score 12 on average/)).toBeInTheDocument();
    expect(screen.getByText(/applied to score 55 on average/)).toBeInTheDocument();
  });
});
