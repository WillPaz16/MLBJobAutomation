import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Discovery } from "../src/pages/Discovery";
import { Pipeline } from "../src/pages/Pipeline";
import { Documents } from "../src/pages/Documents";
import { Analytics } from "../src/pages/Analytics";

vi.mock("../src/api/client", () => ({
  api: {
    postings: {
      list: vi.fn().mockResolvedValue({ postings: [], total: 0 }),
      approve: vi.fn(),
      organizations: vi.fn().mockResolvedValue([]),
    },
    applications: { list: vi.fn().mockResolvedValue([]), update: vi.fn() },
    documents: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), remove: vi.fn() },
    analytics: {
      summary: vi.fn().mockResolvedValue({
        total: 0,
        byStage: {},
        bySource: {},
        avgResponseDays: null,
        avgResponseDaysByStage: {},
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
    await waitFor(() => expect(screen.getAllByText(/None yet\./i).length).toBeGreaterThan(0));
  });

  it("Analytics renders stats after loading", async () => {
    renderWithRouter(<Analytics />);
    await waitFor(() => expect(screen.getByText("Total applications")).toBeInTheDocument());
  });
});
