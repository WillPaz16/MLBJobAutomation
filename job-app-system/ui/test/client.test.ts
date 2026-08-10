import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api/client";

function mockFetch(response: Partial<Response> & { jsonBody?: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody,
  } as Response);
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: [{ id: "1" }] }));
    const result = await api.postings.list();
    expect(result).toEqual([{ id: "1" }]);
  });

  it("omits empty/undefined query params", async () => {
    const fetchMock = mockFetch({ ok: true, jsonBody: [] });
    vi.stubGlobal("fetch", fetchMock);
    await api.postings.list({ category: "", location: undefined, q: "cubs" });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("q=cubs");
    expect(calledUrl).not.toContain("category=");
    expect(calledUrl).not.toContain("location=");
  });

  it("throws an ApiError with the server's error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ ok: false, status: 400, jsonBody: { error: "Validation failed", details: ["x"] } })
    );
    await expect(api.postings.list()).rejects.toMatchObject({
      status: 400,
      message: "Validation failed",
    });
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    vi.stubGlobal("fetch", {
      // no .json() success path
      __proto__: undefined,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      } as unknown as Response)
    );
    await expect(api.postings.list()).rejects.toBeInstanceOf(ApiError);
  });

  it("returns undefined for a 204 response without parsing a body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => {
          throw new Error("should not be called");
        },
      } as unknown as Response)
    );
    const result = await api.applications.remove("id-1");
    expect(result).toBeUndefined();
  });
});
