import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Settings } from "../src/pages/Settings";
import { ApplyPanel } from "../src/components/ApplyPanel";

const { identityGet, identityUpdate, MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return {
    identityGet: vi.fn(),
    identityUpdate: vi.fn(),
    MockApiError,
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../src/api/client", () => ({
  ApiError: MockApiError,
  api: {
    identity: {
      get: identityGet,
      update: identityUpdate,
      education: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
    },
    answers: {
      snippets: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      overrides: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
    },
    tonePresets: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    orgProfiles: {
      list: vi.fn().mockResolvedValue([]),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    applications: {
      list: vi.fn().mockResolvedValue([]),
      applyPack: vi.fn(),
      applyAssistScriptUrl: (id: string) => `/api/applications/${id}/apply-assist-script`,
    },
    documents: {
      fileUrl: (id: string, download = false) => `/api/documents/${id}/file${download ? "?download=1" : ""}`,
    },
  },
}));

function renderWithRouter(node: React.ReactElement) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

describe("Settings page", () => {
  it("renders all four tabs and defaults to Identity", async () => {
    identityGet.mockResolvedValueOnce(null);
    renderWithRouter(<Settings />);
    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Education" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Answers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tone & Orgs" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
  });

  it("switches to the Education tab and shows the add-education control", async () => {
    identityGet.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderWithRouter(<Settings />);
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Education" }));
    await waitFor(() => expect(screen.getByText("Add education")).toBeInTheDocument());
  });

  it("renders three-state work-authorization controls, not a checkbox", async () => {
    identityGet.mockResolvedValueOnce(null);
    renderWithRouter(<Settings />);
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
    const label = screen.getByText("Are you legally authorized to work in the US?");
    const container = label.closest("div")!;
    expect(within(container).getByText("Yes")).toBeInTheDocument();
    expect(within(container).getByText("No")).toBeInTheDocument();
    expect(within(container).getByText("Declined")).toBeInTheDocument();
  });

  it("Education entry delete requires confirmation before calling the API", async () => {
    identityGet.mockResolvedValueOnce(null);
    const { api } = await import("../src/api/client");
    (api.identity.education.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "edu-1", school: "State U", degree: "BS", fieldOfStudy: "CS", startDate: "2018", endDate: "2022", gpa: "3.9", isPrimary: true },
    ]);
    const educationRemove = api.identity.education.remove as ReturnType<typeof vi.fn>;
    educationRemove.mockClear();
    educationRemove.mockResolvedValueOnce(undefined);

    const user = userEvent.setup();
    renderWithRouter(<Settings />);
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Education" }));
    await waitFor(() => expect(screen.getByText("State U")).toBeInTheDocument());

    // Clicking the delete icon opens a confirmation dialog rather than deleting immediately.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Delete education entry?")).toBeInTheDocument();
    expect(educationRemove).not.toHaveBeenCalled();

    // Cancel leaves the entry alone.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Delete education entry?")).not.toBeInTheDocument());
    expect(educationRemove).not.toHaveBeenCalled();

    // Confirming calls the API.
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(educationRemove).toHaveBeenCalledWith("edu-1"));
  });
});

describe("ApplyPanel", () => {
  it("stays collapsed by default and does not fetch until opened", async () => {
    const { api } = await import("../src/api/client");
    renderWithRouter(<ApplyPanel applicationId="app-1" />);
    expect(screen.getByText("Apply assist")).toBeInTheDocument();
    expect(api.applications.applyPack).not.toHaveBeenCalled();
  });

  it("fetches and shows masked sensitive fields with a reveal toggle after opening", async () => {
    const { api } = await import("../src/api/client");
    (api.applications.applyPack as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      application: { id: "app-1", posting: { title: "Analyst", organization: "Royals", url: "https://example.com" } },
      identity: {
        id: "identity",
        legalFirstName: "Will",
        dateOfBirth: "1999-03-14",
        addressStreet: "123 Main St",
        email: "will@example.com",
      },
      resolvedAnswers: [],
    });
    const user = userEvent.setup();
    renderWithRouter(<ApplyPanel applicationId="app-1" />);
    await user.click(screen.getByText("Apply assist"));
    await waitFor(() => expect(screen.getByText("Will")).toBeInTheDocument());

    // Sensitive fields masked by default (DOB and street address both apply here)
    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0);
    expect(screen.queryByText("1999-03-14")).not.toBeInTheDocument();

    // Non-sensitive field shown in the clear
    expect(screen.getByText("will@example.com")).toBeInTheDocument();

    // Reveal the DOB
    const revealButtons = screen.getAllByLabelText(/Reveal Date of birth/);
    await user.click(revealButtons[0]);
    await waitFor(() => expect(screen.getByText("1999-03-14")).toBeInTheDocument());
  });
});
