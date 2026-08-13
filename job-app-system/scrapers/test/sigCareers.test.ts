import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { sigCareersAdapter } from "../src/adapters/sigCareers.js";

describe("sigCareersAdapter", () => {
  it("maps jobs to NormalizedPosting and paginates until an empty page", async () => {
    server.use(
      http.get("https://careers.sig.com/api/jobs", ({ request }) => {
        const page = new URL(request.url).searchParams.get("page");
        if (page === "1") {
          return HttpResponse.json({
            totalCount: 2,
            jobs: [
              {
                data: {
                  slug: "111",
                  title: "Data Scientist",
                  description: "<p>Build statistical models for trading.</p>",
                  city: "Bala Cynwyd",
                  state: "Pennsylvania",
                  hiring_organization: "Susquehanna International Group, LLP",
                  apply_url: "https://careers-sig.icims.com/jobs/111/login",
                  posted_date: "2026-08-01T00:00:00+0000",
                },
              },
            ],
          });
        }
        if (page === "2") {
          return HttpResponse.json({
            totalCount: 2,
            jobs: [
              {
                data: {
                  slug: "112",
                  title: "Software Engineer",
                  description: "<p>Build trading systems.</p>",
                  city: "New York",
                  state: "New York",
                  hiring_organization: "Susquehanna International Group, LLP",
                  apply_url: "https://careers-sig.icims.com/jobs/112/login",
                  posted_date: "2026-08-02T00:00:00+0000",
                },
              },
            ],
          });
        }
        return HttpResponse.json({ totalCount: 2, jobs: [] });
      })
    );

    const postings = await sigCareersAdapter.fetchPostings({
      organizationName: "Susquehanna International Group, LLP",
    });

    expect(postings).toHaveLength(2);
    expect(postings[0]).toMatchObject({
      externalId: "111",
      title: "Data Scientist",
      organization: "Susquehanna International Group, LLP",
      location: "Bala Cynwyd, Pennsylvania",
      category: "DATA_SCIENCE",
      url: "https://careers-sig.icims.com/jobs/111/login",
      description: "<p>Build statistical models for trading.</p>",
    });
    expect(postings.map((p) => p.externalId).sort()).toEqual(["111", "112"]);
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.get("https://careers.sig.com/api/jobs", () => HttpResponse.json({}, { status: 500 }))
    );
    await expect(
      sigCareersAdapter.fetchPostings({ organizationName: "Susquehanna International Group, LLP" })
    ).rejects.toThrow(/SIG careers fetch failed/);
  });

  it("stops pagination on an empty jobs array even if totalCount claims more remain", async () => {
    server.use(
      http.get("https://careers.sig.com/api/jobs", () =>
        HttpResponse.json({ totalCount: 50, jobs: [] })
      )
    );
    const postings = await sigCareersAdapter.fetchPostings({
      organizationName: "Susquehanna International Group, LLP",
    });
    expect(postings).toHaveLength(0);
  });
});
