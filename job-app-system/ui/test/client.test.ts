import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api/client";

function mockFetch(response: Partial<Response> & { jsonBody?: unknown; totalCount?: string }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody,
    headers: { get: (name: string) => (name === "X-Total-Count" ? (response.totalCount ?? null) : null) },
  } as unknown as Response);
}

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed postings plus the total count from the X-Total-Count header", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: [{ id: "1" }], totalCount: "42" }));
    const result = await api.postings.list();
    expect(result).toEqual({ postings: [{ id: "1" }], total: 42 });
  });

  it("falls back to the returned page length when X-Total-Count is missing", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: [{ id: "1" }, { id: "2" }] }));
    const result = await api.postings.list();
    expect(result.total).toBe(2);
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

  it("passes seniority, remoteOnly, and minFit through as query params", async () => {
    const fetchMock = mockFetch({ ok: true, jsonBody: [] });
    vi.stubGlobal("fetch", fetchMock);
    await api.postings.list({ seniority: "SENIOR", remoteOnly: true, minFit: 40 });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("seniority=SENIOR");
    expect(calledUrl).toContain("remoteOnly=true");
    expect(calledUrl).toContain("minFit=40");
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

describe("api.profile", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: null }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("get() returns null when no profile has been created", async () => {
    const result = await api.profile.get();
    expect(result).toBeNull();
  });

  it("update() PUTs the profile body and returns the parsed response", async () => {
    const fetchMock = mockFetch({ ok: true, jsonBody: { id: "profile", skills: "python" } });
    vi.stubGlobal("fetch", fetchMock);
    const result = await api.profile.update({ skills: "python" });
    expect(result).toEqual({ id: "profile", skills: "python" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("/profile");
    expect(options.method).toBe("PUT");
  });
});

describe("api.resumeBullets", () => {
  it("list() returns the parsed bullet array", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, jsonBody: [{ id: "1", tags: "python,sql" }] }));
    const result = await api.resumeBullets.list();
    expect(result).toEqual([{ id: "1", tags: "python,sql" }]);
  });
});
