import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Discovery } from "../src/pages/Discovery";

const listMock = vi.fn().mockResolvedValue({ postings: [], total: 0 });
const updateMock = vi.fn().mockResolvedValue({});
const savedSearchesListMock = vi.fn().mockResolvedValue([]);
const savedSearchesUpdateMock = vi.fn().mockResolvedValue({});
const savedSearchesRemoveMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/api/client", () => ({
  api: {
    postings: {
      list: (...args: unknown[]) => listMock(...args),
      approve: vi.fn(),
      organizations: vi.fn().mockResolvedValue([]),
      facets: vi.fn().mockResolvedValue({
        seniorities: [],
        workModes: [],
        regions: [],
        mlbTeamCounts: { true: 186, false: 107 },
        sourceSectionCounts: {
          "Data Science, AI & Machine Learning": 83,
          "Quantitative Finance": 18,
          "Product Management": 6,
        },
        categoryCounts: { DATA_SCIENCE: 241 },
        allActiveCount: 400,
        sourceTypes: ["greenhouse", "lever"],
      }),
      update: (...args: unknown[]) => updateMock(...args),
      createManual: vi.fn(),
    },
    applications: { remove: vi.fn() },
    notifications: { list: vi.fn().mockResolvedValue([]) },
    profile: { get: vi.fn().mockResolvedValue(null) },
    savedSearches: {
      list: (...args: unknown[]) => savedSearchesListMock(...args),
      create: vi.fn(),
      update: (...args: unknown[]) => savedSearchesUpdateMock(...args),
      remove: (...args: unknown[]) => savedSearchesRemoveMock(...args),
    },
  },
}));

let capturedSearch = "";

function LocationSpy() {
  capturedSearch = useLocation().search;
  return null;
}

function renderDiscovery(initialEntries: string[]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Discovery />
      <LocationSpy />
    </MemoryRouter>
  );
}

describe("Discovery URL-driven filters", () => {
  it("fires exactly one load per filter change, even while on page 2", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?page=2"]);

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    // Location now lives in Row B ("More filters"), collapsed by default — open it first.
    fireEvent.click(screen.getByRole("button", { name: /More filters/i }));
    const locationInput = screen.getByLabelText(/^Location$/i);
    fireEvent.change(locationInput, { target: { value: "Chicago" } });

    // Debounce is 300ms — wait past it for the URL write + resulting single fetch.
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2), { timeout: 1000 });

    // Confirm no trailing second fetch sneaks in afterward (the historical double-load bug).
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(listMock).toHaveBeenCalledTimes(2);
  });

  it("round-trips a debounced filter change into the URL", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByLabelText(/^Search$/i);
    fireEvent.change(searchInput, { target: { value: "analytics" } });

    await waitFor(() => expect(capturedSearch).toContain("search=analytics"), { timeout: 1000 });
  });

  it("resets page to 1 when a filter changes while on a later page", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?page=3"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(capturedSearch).toContain("page=3");

    fireEvent.click(screen.getByRole("button", { name: /More filters/i }));
    const locationInput = screen.getByLabelText(/^Location$/i);
    fireEvent.change(locationInput, { target: { value: "Remote" } });

    await waitFor(() => expect(capturedSearch).not.toContain("page="), { timeout: 1000 });
  });

  it("passes workMode and region filters through to the URL", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?workMode=REMOTE&region=USA"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ workMode: "REMOTE", region: "USA" })
    );
  });

  it("defaults to the Baseball tab (isMlbTeam=true, no sourceSection)", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ isMlbTeam: true, sourceSection: undefined })
    );
  });

  it.each([
    ["ds-ai-ml", "Data Science, AI & Machine Learning"],
    ["quant", "Quantitative Finance"],
    ["pm", "Product Management"],
  ])("sends isMlbTeam=false and sourceSection for the %s tab", async (tab, section) => {
    listMock.mockClear();
    renderDiscovery([`/discovery?tab=${tab}`]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ isMlbTeam: false, sourceSection: section })
    );
  });

  it("switches tabs via the tab control and updates params/URL", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    const dsTab = await screen.findByRole("tab", { name: /Data Science & AI\/ML/i });
    fireEvent.click(dsTab);

    await waitFor(() => expect(capturedSearch).toContain("tab=ds-ai-ml"));
    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({
          isMlbTeam: false,
          sourceSection: "Data Science, AI & Machine Learning",
        })
      )
    );
  });

  // v11 Phase 3 — the category-driven "Data Science (All Sources)" tab, a source-agnostic view
  // distinct from the SimplifyJobs-aggregator-only "ds-ai-ml" tab above.
  it("sends category=DATA_SCIENCE and no isMlbTeam/sourceSection scoping for the data-science tab", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?tab=data-science"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "DATA_SCIENCE",
        isMlbTeam: undefined,
        sourceSection: undefined,
      })
    );
  });

  it("ignores the category filter param and still fixes category=DATA_SCIENCE on the data-science tab", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?tab=data-science&category=BASEBALL_OPS"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ category: "DATA_SCIENCE" }));
  });

  it("hides the in-tab category filter dropdown while the data-science tab is active", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?tab=data-science"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /More filters/i }));
    expect(screen.queryByLabelText(/^Category$/i)).not.toBeInTheDocument();
  });

  it("shows the in-tab category filter dropdown on other tabs (e.g. Baseball)", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /More filters/i }));
    expect(screen.getByLabelText(/^Category$/i)).toBeInTheDocument();
  });
});

describe("Discovery bulk dismiss", () => {
  it("shows a Dismiss selected action and dismisses all selected ids", async () => {
    listMock.mockClear();
    updateMock.mockClear();
    const postings = [
      {
        id: "p1",
        title: "Analyst",
        organization: "Cubs",
        location: "Chicago",
        category: "BASEBALL_OPS",
        seniority: null,
        workMode: null,
        region: null,
        salary: null,
        url: "https://example.com/1",
        description: null,
        postedAt: null,
        discoveredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        closedAt: null,
        missedRuns: 0,
        possibleDuplicateOfId: null,
        duplicateRejected: false,
        dismissedAt: null,
        applications: [],
      },
      {
        id: "p2",
        title: "Scout",
        organization: "Cubs",
        location: "Chicago",
        category: "BASEBALL_OPS",
        seniority: null,
        workMode: null,
        region: null,
        salary: null,
        url: "https://example.com/2",
        description: null,
        postedAt: null,
        discoveredAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        closedAt: null,
        missedRuns: 0,
        possibleDuplicateOfId: null,
        duplicateRejected: false,
        dismissedAt: null,
        applications: [],
      },
    ];
    listMock.mockResolvedValue({ postings, total: postings.length });

    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    const checkbox1 = await screen.findByRole("checkbox", { name: "Select Analyst" });
    const checkbox2 = await screen.findByRole("checkbox", { name: "Select Scout" });
    fireEvent.click(checkbox1);
    fireEvent.click(checkbox2);

    const dismissButton = await screen.findByRole("button", { name: /Dismiss selected/i });
    fireEvent.click(dismissButton);

    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(updateMock).toHaveBeenCalledWith("p1", { dismissedAt: expect.any(String) });
    expect(updateMock).toHaveBeenCalledWith("p2", { dismissedAt: expect.any(String) });
  });
});

// v10 accessibility pass: the star/delete actions used to be <button>s nested inside a single
// DropdownMenuItem — invalid HTML, and unreachable by the menu's own arrow-key navigation. Each
// saved search is now three separate, individually keyboard-navigable DropdownMenuItems
// ("Apply …" / "Set … as default" / "Delete …"), with no interactive element nested inside another.
describe("Discovery saved-search menu", () => {
  const savedSearch = { id: "s1", name: "Strong fits", query: "minFit=70", isDefault: false, createdAt: "2026-01-01T00:00:00Z" };

  it("exposes apply/default/delete as separate, non-nested menu items", async () => {
    listMock.mockClear();
    savedSearchesListMock.mockResolvedValue([savedSearch]);
    const user = userEvent.setup();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /Saved searches/i }));

    const applyItem = await screen.findByRole("menuitem", { name: /Apply "Strong fits"/i });
    const defaultItem = screen.getByRole("menuitem", { name: /Set "Strong fits" as default/i });
    const deleteItem = screen.getByRole("menuitem", { name: /Delete "Strong fits"/i });

    // Each is its own top-level menuitem (not a <button> nested inside another menuitem) — no
    // element here should contain another interactive descendant.
    expect(applyItem.querySelector("button, [role='menuitem']")).toBeNull();
    expect(defaultItem.querySelector("button, [role='menuitem']")).toBeNull();
    expect(deleteItem.querySelector("button, [role='menuitem']")).toBeNull();
  });

  it("still gates delete behind the ConfirmDialog and calls remove only on confirm", async () => {
    listMock.mockClear();
    savedSearchesListMock.mockResolvedValue([savedSearch]);
    savedSearchesRemoveMock.mockClear();
    const user = userEvent.setup();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /Saved searches/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Delete "Strong fits"/i }));

    expect(await screen.findByText("Delete saved view?")).toBeInTheDocument();
    expect(savedSearchesRemoveMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(savedSearchesRemoveMock).toHaveBeenCalledWith("s1"));
  });

  it("sets a saved search as default via its own menu item", async () => {
    listMock.mockClear();
    savedSearchesListMock.mockResolvedValue([savedSearch]);
    savedSearchesUpdateMock.mockClear();
    const user = userEvent.setup();
    renderDiscovery(["/discovery"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /Saved searches/i }));
    await user.click(await screen.findByRole("menuitem", { name: /Set "Strong fits" as default/i }));

    await waitFor(() => expect(savedSearchesUpdateMock).toHaveBeenCalledWith("s1", { isDefault: true }));
  });
});
