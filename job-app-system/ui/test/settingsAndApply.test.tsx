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
      list: vi.fn().mockResolvedValue([
        {
          id: "cm000000000000000000app1",
          posting: { title: "Quant Analyst", organization: "Royals" },
        },
      ]),
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

describe("Settings - Answers tab", () => {
  it("shows the application picker's real title/org label, not the raw cuid, once selected", async () => {
    identityGet.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderWithRouter(<Settings />);
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Answers" }));

    const label = await screen.findByText("Application");
    const trigger = within(label.closest("div")!).getByRole("combobox");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Quant Analyst — Royals" }));

    await waitFor(() => expect(trigger).toHaveTextContent("Quant Analyst — Royals"));
    expect(trigger).not.toHaveTextContent("cm000000000000000000app1");
  });

  it("supports editing an existing answer override instead of only create/delete", async () => {
    identityGet.mockResolvedValueOnce(null);
    const { api } = await import("../src/api/client");
    const overridesList = api.answers.overrides.list as ReturnType<typeof vi.fn>;
    const overridesUpdate = api.answers.overrides.update as ReturnType<typeof vi.fn>;
    const overridesCreate = api.answers.overrides.create as ReturnType<typeof vi.fn>;
    overridesList.mockResolvedValue([
      { id: "ov-1", applicationId: "cm000000000000000000app1", questionKey: "why-us", answer: "Original answer", snippetId: null },
    ]);
    overridesUpdate.mockResolvedValueOnce({
      id: "ov-1",
      applicationId: "cm000000000000000000app1",
      questionKey: "why-us",
      answer: "Edited answer",
      snippetId: null,
    });

    const user = userEvent.setup();
    renderWithRouter(<Settings />);
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Answers" }));

    const label = await screen.findByText("Application");
    const trigger = within(label.closest("div")!).getByRole("combobox");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Quant Analyst — Royals" }));

    await screen.findByText("why-us");
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const answerBox = screen.getByDisplayValue("Original answer");
    await user.clear(answerBox);
    await user.type(answerBox, "Edited answer");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(overridesUpdate).toHaveBeenCalledWith(
        "ov-1",
        expect.objectContaining({ questionKey: "why-us", answer: "Edited answer" })
      )
    );
    expect(overridesCreate).not.toHaveBeenCalled();
  });
});

describe("Settings - Education tab", () => {
  it("uses a checkbox (not a radio) for the primary-degree flag so it can be unchecked", async () => {
    identityGet.mockResolvedValueOnce(null);
    const { api } = await import("../src/api/client");
    (api.identity.education.list as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "edu-1", school: "State U", degree: "BS", fieldOfStudy: "CS", startDate: "2018", endDate: "2022", gpa: "3.9", isPrimary: true },
    ]);

    const user = userEvent.setup();
    renderWithRouter(<Settings />);
    await waitFor(() => expect(screen.getByText("Save identity")).toBeInTheDocument());
    await user.click(screen.getByRole("tab", { name: "Education" }));
    await waitFor(() => expect(screen.getByText("State U")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const primaryCheckbox = screen.getByRole("checkbox", { name: /Primary degree/ });
    expect(primaryCheckbox).toBeChecked();

    // A radio input in a group of one can't be unchecked by clicking it again — a checkbox can.
    await user.click(primaryCheckbox);
    expect(primaryCheckbox).not.toBeChecked();
  });
});

describe("Settings - Identity tab EEO fields", () => {
  it("lets a previously-answered EEO field be cleared back to Not answered", async () => {
    identityGet.mockResolvedValueOnce({
      id: "identity",
      genderIdentityCode: "female",
      genderIdentityLabel: "Female",
      updatedAt: new Date().toISOString(),
    });
    const user = userEvent.setup();
    renderWithRouter(<Settings />);

    const genderLabel = await screen.findByText("Gender");
    const genderTrigger = within(genderLabel.closest("div")!).getByRole("combobox");
    await waitFor(() => expect(genderTrigger).toHaveTextContent("Female"));

    await user.click(genderTrigger);
    await user.click(await screen.findByRole("option", { name: "Not answered" }));

    await waitFor(() => expect(genderTrigger).toHaveTextContent("Not answered"));
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
