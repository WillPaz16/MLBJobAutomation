import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { pinpointAdapter } from "../src/adapters/pinpoint.js";

describe("pinpointAdapter", () => {
  it("maps postings to NormalizedPosting, joining description sections", async () => {
    server.use(
      http.get("https://wolve.pinpointhq.com/postings.json", () =>
        HttpResponse.json({
          data: [
            {
              id: "446898",
              title: "Data Scientist",
              description: "Build models for our trading systems.",
              key_responsibilities: "<ul><li>Analyze market data</li></ul>",
              skills_knowledge_expertise: "<ul><li>Strong Python skills</li></ul>",
              url: "https://careers.wolve.com/en/postings/abc-123",
              location: { name: "Chicago, IL", city: "Chicago" },
            },
          ],
        })
      )
    );

    const postings = await pinpointAdapter.fetchPostings({
      subdomain: "wolve",
      organizationName: "Wolverine Trading",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "446898",
      title: "Data Scientist",
      organization: "Wolverine Trading",
      location: "Chicago, IL",
      category: "DATA_SCIENCE",
      url: "https://careers.wolve.com/en/postings/abc-123",
    });
    expect(postings[0].description).toContain("Build models for our trading systems.");
    expect(postings[0].description).toContain("Analyze market data");
    expect(postings[0].description).toContain("Strong Python skills");
  });

  it("falls back to location.city when location.name is absent", async () => {
    server.use(
      http.get("https://wolve.pinpointhq.com/postings.json", () =>
        HttpResponse.json({
          data: [
            {
              id: "1",
              title: "Recruiter",
              url: "https://careers.wolve.com/en/postings/xyz",
              location: { city: "Chicago" },
            },
          ],
        })
      )
    );

    const postings = await pinpointAdapter.fetchPostings({
      subdomain: "wolve",
      organizationName: "Wolverine Trading",
    });
    expect(postings[0].location).toBe("Chicago");
    expect(postings[0].description).toBeUndefined();
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.get("https://wolve.pinpointhq.com/postings.json", () => HttpResponse.json({}, { status: 404 }))
    );
    await expect(
      pinpointAdapter.fetchPostings({ subdomain: "wolve", organizationName: "Wolverine Trading" })
    ).rejects.toThrow(/Pinpoint fetch failed/);
  });
});
