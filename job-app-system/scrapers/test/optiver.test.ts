import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { optiverAdapter } from "../src/adapters/optiver.js";

const richTextHtml = (text: string) =>
  `<html><body><!-- React Component - Components.RichText - Start --><div class="prose"><p>${text}</p></div><!-- React Component - Components.RichText - End --></body></html>`;

describe("optiverAdapter", () => {
  it("maps jobs to NormalizedPosting, paginates by `from`, and fetches description from the detail page", async () => {
    server.use(
      http.get("https://www.optiver.com/en/api/v1/jobs", ({ request }) => {
        const from = new URL(request.url).searchParams.get("from");
        if (from === "0") {
          return HttpResponse.json({
            totalCount: 1,
            items: [
              {
                title: "Data Scientist",
                location: "Chicago",
                href: "/join-us/jobs/technology/chicago/data-scientist/",
              },
            ],
          });
        }
        return HttpResponse.json({ totalCount: 1, items: [] });
      }),
      http.get("https://www.optiver.com/join-us/jobs/technology/chicago/data-scientist/", () =>
        HttpResponse.text(richTextHtml("Build models for market making."))
      )
    );

    const postings = await optiverAdapter.fetchPostings({ organizationName: "Optiver" });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "/join-us/jobs/technology/chicago/data-scientist/",
      title: "Data Scientist",
      organization: "Optiver",
      location: "Chicago",
      category: "DATA_SCIENCE",
      url: "https://www.optiver.com/join-us/jobs/technology/chicago/data-scientist/",
      description: '<div class="prose"><p>Build models for market making.</p></div>',
    });
  });

  it("throws on a non-OK response from the list endpoint", async () => {
    server.use(
      http.get("https://www.optiver.com/en/api/v1/jobs", () => HttpResponse.json({}, { status: 500 }))
    );
    await expect(optiverAdapter.fetchPostings({ organizationName: "Optiver" })).rejects.toThrow(
      /Optiver fetch failed/
    );
  });

  it("still returns a posting with no description if the detail fetch fails", async () => {
    server.use(
      http.get("https://www.optiver.com/en/api/v1/jobs", ({ request }) => {
        const from = new URL(request.url).searchParams.get("from");
        if (from === "0") {
          return HttpResponse.json({
            totalCount: 1,
            items: [{ title: "Recruiter", location: "Amsterdam", href: "/join-us/jobs/recruiter/" }],
          });
        }
        return HttpResponse.json({ totalCount: 1, items: [] });
      }),
      http.get("https://www.optiver.com/join-us/jobs/recruiter/", () =>
        HttpResponse.json({}, { status: 404 })
      )
    );

    const postings = await optiverAdapter.fetchPostings({ organizationName: "Optiver" });
    expect(postings).toHaveLength(1);
    expect(postings[0].description).toBeUndefined();
  });
});
