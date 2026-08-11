import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Discovery } from "../src/pages/Discovery";

const listMock = vi.fn().mockResolvedValue({ postings: [], total: 0 });

vi.mock("../src/api/client", () => ({
  api: {
    postings: {
      list: (...args: unknown[]) => listMock(...args),
      approve: vi.fn(),
      organizations: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      createManual: vi.fn(),
    },
    applications: { remove: vi.fn() },
    notifications: { list: vi.fn().mockResolvedValue([]) },
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

    const locationInput = screen.getByLabelText(/Location contains/i);
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

    const searchInput = screen.getByLabelText(/Search title\/org/i);
    fireEvent.change(searchInput, { target: { value: "analytics" } });

    await waitFor(() => expect(capturedSearch).toContain("search=analytics"), { timeout: 1000 });
  });

  it("resets page to 1 when a filter changes while on a later page", async () => {
    listMock.mockClear();
    renderDiscovery(["/discovery?page=3"]);
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    expect(capturedSearch).toContain("page=3");

    const locationInput = screen.getByLabelText(/Location contains/i);
    fireEvent.change(locationInput, { target: { value: "Remote" } });

    await waitFor(() => expect(capturedSearch).not.toContain("page="), { timeout: 1000 });
  });
});
