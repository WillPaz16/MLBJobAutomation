import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Discovery } from "../src/pages/Discovery";
import { Pipeline } from "../src/pages/Pipeline";
import { Documents } from "../src/pages/Documents";
import { Analytics } from "../src/pages/Analytics";

const { documentsRemove, applicationsRemove, applicationsReorder, toastError, toastSuccess, MockApiError } =
  vi.hoisted(() => {
    class MockApiError extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    }
    return {
      documentsRemove: vi.fn().mockResolvedValue(undefined),
      applicationsRemove: vi.fn().mockResolvedValue(undefined),
      applicationsReorder: vi.fn().mockResolvedValue([]),
      toastError: vi.fn(),
      toastSuccess: vi.fn(),
      MockApiError,
    };
  });

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

vi.mock("../src/api/client", () => ({
  ApiError: MockApiError,
  api: {
    postings: {
      list: vi.fn().mockResolvedValue({ postings: [], total: 0 }),
      approve: vi.fn(),
      organizations: vi.fn().mockResolvedValue([]),
      facets: vi.fn().mockResolvedValue({
        seniorities: [],
        workModes: [],
        regions: [],
        mlbTeamCounts: { true: 0, false: 0 },
        sourceSectionCounts: {},
        allActiveCount: 0,
        sourceTypes: [],
      }),
    },
    profile: { get: vi.fn().mockResolvedValue(null) },
    savedSearches: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    applications: {
      list: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      remove: applicationsRemove,
      reorder: applicationsReorder,
    },
    documents: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      remove: documentsRemove,
      scan: vi.fn().mockResolvedValue({ inserted: 0, skipped: 0 }),
      fileUrl: (id: string, download = false) => `/api/documents/${id}/file${download ? "?download=1" : ""}`,
    },
    analytics: {
      summary: vi.fn().mockResolvedValue({
        total: 0,
        byStage: {},
        bySource: {},
      }),
      timeseries: vi.fn().mockResolvedValue({
        weeks: [],
        discovered: [],
        applicationsCreated: [],
        applied: [],
        fitScores: [],
      }),
      funnel: vi.fn().mockResolvedValue({
        reached: {},
        conversion: {},
        daysInStage: {},
        medianDaysToResponse: null,
        meanDaysToResponse: null,
        sampleSizes: { totalApplications: 0, appliedReached: 0, responseSampleSize: 0 },
      }),
      market: vi.fn().mockResolvedValue({
        timeToClose: { bucketLabels: [], mlb: [], nonMlb: [], postedAtBasedCount: 0, discoveredAtFallbackCount: 0 },
        discoveryLag: { median: null, mean: null, n: 0 },
        dismissalBreakdown: { category: [], seniority: [], workMode: [], region: [] },
        fitScoreByCohort: {
          dismissed: { median: null, mean: null, n: 0 },
          applied: { median: null, mean: null, n: 0 },
          other: { median: null, mean: null, n: 0 },
        },
        supplyMix: { weeks: [], active: [], closed: [], bySeniority: [], byWorkMode: [], byRegion: [], byMlbTeam: [] },
      }),
    },
    notifications: { list: vi.fn().mockResolvedValue([]), generate: vi.fn() },
  },
}));

function renderWithRouter(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("page smoke tests", () => {
  it("Discovery renders empty state after loading", async () => {
    renderWithRouter(<Discovery />);
    await waitFor(() => expect(screen.getByText(/No postings yet/i)).toBeInTheDocument());
  });

  it("Pipeline renders all stage columns after loading", async () => {
    renderWithRouter(<Pipeline />);
    await waitFor(() => expect(screen.getByText("Found")).toBeInTheDocument());
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  it("Documents renders empty lists after loading", async () => {
    renderWithRouter(<Documents />);
    await waitFor(() => expect(screen.getAllByText(/None yet/i).length).toBeGreaterThan(0));
  });

  it("Analytics renders stats after loading", async () => {
    renderWithRouter(<Analytics />);
    await waitFor(() => expect(screen.getByText("Total applications")).toBeInTheDocument());
  });

  it("Pipeline shows the empty-state CTA linking to Discovery when there are no applications", async () => {
    renderWithRouter(<Pipeline />);
    await waitFor(() => expect(screen.getByText("No applications yet")).toBeInTheDocument());
    const link = screen.getByText("Go to Discovery").closest("a");
    expect(link).toHaveAttribute("href", "/discovery");
  });

  it("Documents delete flow: cancel keeps the document, confirm removes it", async () => {
    documentsRemove.mockClear();
    documentsRemove.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { api } = await import("../src/api/client");
    (api.documents.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "doc-1", kind: "resume", label: "Base Resume", filePath: "/tmp/resume.pdf", isBaseTemplate: false, createdAt: "" },
    ]);
    renderWithRouter(<Documents />);
    await waitFor(() => expect(screen.getByText("Base Resume")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete document" }));
    expect(await screen.findByText("Delete document?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Delete document?")).not.toBeInTheDocument());
    expect(documentsRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete document" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(documentsRemove).toHaveBeenCalledWith("doc-1"));
  });

  it("Documents delete shows a clear message for the 409 attached-to-application error", async () => {
    documentsRemove.mockClear();
    documentsRemove.mockRejectedValueOnce(new MockApiError(409, "Document is still assigned to an application"));
    const user = userEvent.setup();
    const { api } = await import("../src/api/client");
    (api.documents.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "doc-2", kind: "cover_letter", label: "Base Cover Letter", filePath: "/tmp/cover.pdf", isBaseTemplate: false, createdAt: "" },
    ]);
    renderWithRouter(<Documents />);
    await waitFor(() => expect(screen.getByText("Base Cover Letter")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Delete document" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        expect.stringContaining("attached to an application — remove it from there first")
      )
    );
  });

  function pipelineApp(overrides: Record<string, unknown>) {
    return {
      id: "app-default",
      postingId: "posting-default",
      stage: "FOUND",
      order: 0,
      resumeDocId: null,
      coverDocId: null,
      notes: null,
      appliedAt: null,
      updatedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      posting: {
        id: "posting-default",
        title: "Some Job",
        organization: "Some Org",
        category: "BASEBALL_ANALYTICS",
        location: null,
        url: null,
        postedAt: null,
        discoveredAt: "2026-01-01T00:00:00Z",
        closedAt: null,
        source: { type: "greenhouse" },
      },
      ...overrides,
    };
  }

  it("Pipeline delete flow: cancel keeps the application, confirm removes it", async () => {
    applicationsRemove.mockClear();
    applicationsRemove.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    const { api } = await import("../src/api/client");
    (api.applications.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      pipelineApp({ id: "app-1", posting: { ...pipelineApp({}).posting, title: "Analyst Role" } }),
    ]);

    renderWithRouter(<Pipeline />);
    await waitFor(() => expect(screen.getByText("Analyst Role")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByText("Remove from pipeline"));
    expect(await screen.findByText("Remove from pipeline?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Remove from pipeline?")).not.toBeInTheDocument());
    expect(applicationsRemove).not.toHaveBeenCalled();
    expect(screen.getByText("Analyst Role")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByText("Remove from pipeline"));
    await user.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => expect(applicationsRemove).toHaveBeenCalledWith("app-1"));
    await waitFor(() => expect(screen.queryByText("Analyst Role")).not.toBeInTheDocument());
  });

  it("Pipeline 'Move to stage' persists order from the FULL destination column, not the category-filtered view", async () => {
    applicationsReorder.mockClear();
    const user = userEvent.setup();
    const { api } = await import("../src/api/client");

    // Two apps already sit in REVIEWING (one per category) — the FULL column has length 2.
    // Only the DATA_SCIENCE one is visible once the category filter below is applied, so a
    // pre-fix implementation computing order from the filtered view would compute 1, not 2.
    (api.applications.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      pipelineApp({
        id: "reviewing-analytics",
        stage: "REVIEWING",
        order: 0,
        posting: { ...pipelineApp({}).posting, id: "p-ra", title: "Reviewing Analytics", category: "BASEBALL_ANALYTICS" },
      }),
      pipelineApp({
        id: "reviewing-ds",
        stage: "REVIEWING",
        order: 1,
        posting: { ...pipelineApp({}).posting, id: "p-rd", title: "Reviewing DS", category: "DATA_SCIENCE" },
      }),
      pipelineApp({
        id: "found-ds",
        stage: "FOUND",
        order: 0,
        posting: { ...pipelineApp({}).posting, id: "p-fd", title: "Found DS", category: "DATA_SCIENCE" },
      }),
    ]);

    renderWithRouter(<Pipeline />);
    await waitFor(() => expect(screen.getByText("Found DS")).toBeInTheDocument());

    // Filter down to Data Science — hides "Reviewing Analytics" from the board.
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Data Science" }));
    await waitFor(() => expect(screen.queryByText("Reviewing Analytics")).not.toBeInTheDocument());
    expect(screen.getByText("Found DS")).toBeInTheDocument();

    // Move the one visible FOUND card into REVIEWING via the non-drag dropdown path.
    // FOUND renders before REVIEWING (STAGES order), so the FOUND column's menu button is first.
    const menuButtons = screen.getAllByRole("button", { name: "More actions" });
    await user.click(menuButtons[0]);
    await user.click(await screen.findByText("Move to Reviewing"));

    await waitFor(() => expect(applicationsReorder).toHaveBeenCalled());
    const payload = applicationsReorder.mock.calls[0][0] as { id: string; stage: string; order: number }[];
    const moved = payload.find((u) => u.id === "found-ds");
    expect(moved?.stage).toBe("REVIEWING");
    // The FULL REVIEWING column has 2 existing rows (analytics + ds), even though only 1 is
    // visible under the filter — the new card must land at order 2, not 1.
    expect(moved?.order).toBe(2);
  });
});
