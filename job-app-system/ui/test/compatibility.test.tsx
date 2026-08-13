import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Compatibility } from "../src/pages/Compatibility";

const { profileCoverage, profileGet, previewCoverage } = vi.hoisted(() => ({
  profileCoverage: vi.fn(),
  profileGet: vi.fn(),
  previewCoverage: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../src/api/client", () => ({
  api: {
    profile: {
      get: profileGet,
      update: vi.fn(),
      coverage: profileCoverage,
      previewCoverage,
    },
    resumeBullets: { list: vi.fn().mockResolvedValue([]) },
  },
}));

describe("Compatibility coverage surfacing", () => {
  it("shows the matched-skill summary line and flags zero-match skills", async () => {
    profileGet.mockResolvedValueOnce({
      id: "profile",
      skills: "sql, plotly",
      coreSkills: "python",
      preferredCategories: null,
      locationKeywords: null,
      excludeKeywords: null,
      updatedAt: new Date().toISOString(),
    });
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

  it("fires the live preview for a brand-new user with no saved profile yet", async () => {
    // Regression test for the "savedDraft never set on the no-profile branch" bug: isDirty was
    // permanently false for a new user because savedDraft stayed null, so previewCoverage could
    // never fire even after editing the seeded defaults.
    profileGet.mockResolvedValueOnce(null);
    profileCoverage.mockResolvedValue({
      totalPostings: 0,
      skills: [],
      fitScores: [],
      tierCounts: { Strong: 0, Good: 0, Fair: 0, Weak: 0 },
      categoryActivity: [],
      calibration: { dismissedAvg: null, dismissedCount: 0, appliedAvg: null, appliedCount: 0 },
    });
    previewCoverage.mockResolvedValue({
      totalPostings: 0,
      skills: [],
      fitScores: [],
      tierCounts: { Strong: 1, Good: 0, Fair: 0, Weak: 0 },
      categoryActivity: [],
      calibration: { dismissedAvg: null, dismissedCount: 0, appliedAvg: null, appliedCount: 0 },
    });

    const user = userEvent.setup();
    render(<Compatibility />);

    const skillsField = await screen.findByLabelText("Skills");
    expect(previewCoverage).not.toHaveBeenCalled();

    await user.type(skillsField, "rust");

    await waitFor(() => expect(previewCoverage).toHaveBeenCalled(), { timeout: 3000 });
  });
});
