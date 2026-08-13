import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { greenhouseAdapter } from "../src/adapters/greenhouse.js";
import { leverAdapter } from "../src/adapters/lever.js";
import { workdayAdapter } from "../src/adapters/workday.js";
import { adpAdapter } from "../src/adapters/adp.js";
import { ukgAdapter } from "../src/adapters/ukg.js";
import { bambooHrAdapter } from "../src/adapters/bamboohr.js";
import { aaimtrackAdapter } from "../src/adapters/aaimtrack.js";
import { teamworkOnlineAdapter } from "../src/adapters/teamworkonline.js";

describe("greenhouseAdapter", () => {
  it("maps jobs to NormalizedPosting, including description via content=true", async () => {
    server.use(
      http.get("https://boards-api.greenhouse.io/v1/boards/testco/jobs", ({ request }) => {
        expect(new URL(request.url).searchParams.get("content")).toBe("true");
        return HttpResponse.json({
          jobs: [
            {
              id: 123,
              title: "Data Scientist",
              absolute_url: "https://boards.greenhouse.io/testco/jobs/123",
              location: { name: "Remote" },
              updated_at: "2026-01-01T00:00:00Z",
              content: "<p>Build data pipelines and models.</p>",
            },
          ],
        });
      })
    );

    const postings = await greenhouseAdapter.fetchPostings({
      boardToken: "testco",
      organizationName: "TestCo",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "123",
      title: "Data Scientist",
      organization: "TestCo",
      location: "Remote",
      category: "DATA_SCIENCE",
      url: "https://boards.greenhouse.io/testco/jobs/123",
      description: "<p>Build data pipelines and models.</p>",
    });
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.get("https://boards-api.greenhouse.io/v1/boards/missing/jobs", () =>
        HttpResponse.json({}, { status: 404 })
      )
    );
    await expect(
      greenhouseAdapter.fetchPostings({ boardToken: "missing", organizationName: "Missing Co" })
    ).rejects.toThrow(/Greenhouse fetch failed/);
  });

  it("merges multiple boardTokens for one org into a single result (e.g. Phillies/Athletics-style dual boards)", async () => {
    server.use(
      http.get("https://boards-api.greenhouse.io/v1/boards/boarda/jobs", () =>
        HttpResponse.json({
          jobs: [
            {
              id: 1,
              title: "Analyst A",
              absolute_url: "https://boards.greenhouse.io/boarda/jobs/1",
              location: { name: "Remote" },
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        })
      ),
      http.get("https://boards-api.greenhouse.io/v1/boards/boardb/jobs", () =>
        HttpResponse.json({
          jobs: [
            {
              id: 2,
              title: "Analyst B",
              absolute_url: "https://boards.greenhouse.io/boardb/jobs/2",
              location: { name: "Remote" },
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        })
      )
    );

    const postings = await greenhouseAdapter.fetchPostings({
      boardTokens: ["boarda", "boardb"],
      organizationName: "DualBoard Co",
    });

    expect(postings).toHaveLength(2);
    expect(postings.map((p) => p.externalId).sort()).toEqual(["1", "2"]);
    expect(postings.every((p) => p.organization === "DualBoard Co")).toBe(true);
  });
});

describe("leverAdapter", () => {
  it("maps postings to NormalizedPosting, including descriptionPlain as description", async () => {
    server.use(
      http.get("https://api.lever.co/v0/postings/testco", () =>
        HttpResponse.json([
          {
            id: "abc-123",
            text: "Machine Learning Engineer",
            hostedUrl: "https://jobs.lever.co/testco/abc-123",
            categories: { location: "New York, NY" },
            createdAt: 1735689600000,
            description: "<div><b>Overview</b></div>",
            descriptionPlain: "Overview: build ML models for production.",
          },
        ])
      )
    );

    const postings = await leverAdapter.fetchPostings({ site: "testco", organizationName: "TestCo" });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "abc-123",
      title: "Machine Learning Engineer",
      organization: "TestCo",
      location: "New York, NY",
      category: "DATA_SCIENCE",
      url: "https://jobs.lever.co/testco/abc-123",
      description: "Overview: build ML models for production.",
    });
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.get("https://api.lever.co/v0/postings/missing", () => HttpResponse.json({}, { status: 404 }))
    );
    await expect(
      leverAdapter.fetchPostings({ site: "missing", organizationName: "Missing Co" })
    ).rejects.toThrow(/Lever fetch failed/);
  });
});

describe("workdayAdapter", () => {
  it("paginates until an empty page, maps postings, and fetches description from the detail endpoint", async () => {
    let callCount = 0;
    server.use(
      http.post("https://test.wd5.myworkdayjobs.com/wday/cxs/testtenant/TestSite/jobs", () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({
            total: 1,
            jobPostings: [
              {
                title: "Baseball Analytics Fellow",
                externalPath: "/job/City-ST/Baseball-Analytics-Fellow_R001",
                locationsText: "City, ST",
                bulletFields: ["R001"],
              },
            ],
          });
        }
        return HttpResponse.json({ total: 1, jobPostings: [] });
      }),
      http.get(
        "https://test.wd5.myworkdayjobs.com/wday/cxs/testtenant/TestSite/job/City-ST/Baseball-Analytics-Fellow_R001",
        () =>
          HttpResponse.json({
            jobPostingInfo: { jobDescription: "<p>Analyze player performance data.</p>" },
          })
      )
    );

    const postings = await workdayAdapter.fetchPostings({
      tenant: "testtenant",
      host: "test.wd5.myworkdayjobs.com",
      site: "TestSite",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "R001",
      title: "Baseball Analytics Fellow",
      organization: "Test Team",
      location: "City, ST",
      category: "BASEBALL_ANALYTICS",
      url: "https://test.wd5.myworkdayjobs.com/en-US/TestSite/job/City-ST/Baseball-Analytics-Fellow_R001",
      description: "<p>Analyze player performance data.</p>",
    });
  });

  it("still returns a posting with no description if the detail fetch fails", async () => {
    server.use(
      http.post("https://test.wd5.myworkdayjobs.com/wday/cxs/detailfailtenant/TestSite/jobs", () =>
        HttpResponse.json({
          total: 1,
          jobPostings: [
            {
              title: "Usher",
              externalPath: "/job/City-ST/Usher_R002",
              locationsText: "City, ST",
              bulletFields: ["R002"],
            },
          ],
        })
      ),
      http.get(
        "https://test.wd5.myworkdayjobs.com/wday/cxs/detailfailtenant/TestSite/job/City-ST/Usher_R002",
        () => HttpResponse.json({}, { status: 500 })
      )
    );

    const postings = await workdayAdapter.fetchPostings({
      tenant: "detailfailtenant",
      host: "test.wd5.myworkdayjobs.com",
      site: "TestSite",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0].description).toBeUndefined();
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.post("https://test.wd5.myworkdayjobs.com/wday/cxs/badtenant/BadSite/jobs", () =>
        HttpResponse.json({}, { status: 500 })
      )
    );
    await expect(
      workdayAdapter.fetchPostings({
        tenant: "badtenant",
        host: "test.wd5.myworkdayjobs.com",
        site: "BadSite",
        organizationName: "Bad Co",
      })
    ).rejects.toThrow(/Workday fetch failed/);
  });
});

describe("adpAdapter", () => {
  it("maps job requisitions to NormalizedPosting", async () => {
    server.use(
      http.get("https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions", () =>
        HttpResponse.json({
          jobRequisitions: [
            {
              itemID: "123_1",
              requisitionTitle: "Data Analyst, Baseball Analytics",
              postDate: "2026-01-01T00:00:00.000-04:00",
              requisitionLocations: [{ nameCode: { shortName: " The Bronx, NY, US" } }],
            },
          ],
        })
      )
    );

    const postings = await adpAdapter.fetchPostings({
      client: "testco",
      cid: "test-cid",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "123_1",
      title: "Data Analyst, Baseball Analytics",
      organization: "Test Team",
      location: "The Bronx, NY, US",
      category: "BASEBALL_ANALYTICS",
    });
    expect(postings[0].url).toContain("ccId=123_1");
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.get("https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions", () =>
        HttpResponse.json({}, { status: 500 })
      )
    );
    await expect(
      adpAdapter.fetchPostings({ client: "bad", cid: "bad-cid", organizationName: "Bad Co" })
    ).rejects.toThrow(/ADP fetch failed/);
  });
});

describe("ukgAdapter", () => {
  it("maps opportunities to NormalizedPosting", async () => {
    server.use(
      http.post("https://test.ukg.example/testtenant/JobBoard/board-1/JobBoardView/LoadSearchResults", () =>
        HttpResponse.json({
          opportunities: [
            {
              Id: "opp-1",
              Title: "Baseball R&D Software Engineer",
              RequisitionNumber: "REQ001",
              PostedDate: "2026-01-01T00:00:00.000Z",
              Locations: [{ Address: { City: "Los Angeles", State: { Code: "CA" } } }],
            },
          ],
        })
      )
    );

    const postings = await ukgAdapter.fetchPostings({
      host: "test.ukg.example",
      tenant: "testtenant",
      boardId: "board-1",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "opp-1",
      title: "Baseball R&D Software Engineer",
      organization: "Test Team",
      location: "Los Angeles, CA",
      category: "BASEBALL_RND",
    });
    expect(postings[0].url).toContain("opportunityId=opp-1");
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.post("https://test.ukg.example/badtenant/JobBoard/board-2/JobBoardView/LoadSearchResults", () =>
        HttpResponse.json({}, { status: 500 })
      )
    );
    await expect(
      ukgAdapter.fetchPostings({
        host: "test.ukg.example",
        tenant: "badtenant",
        boardId: "board-2",
        organizationName: "Bad Co",
      })
    ).rejects.toThrow(/UKG fetch failed/);
  });
});

describe("bambooHrAdapter", () => {
  it("maps career listings to NormalizedPosting, including description from the detail endpoint", async () => {
    server.use(
      http.get("https://testco.bamboohr.com/careers/list", () =>
        HttpResponse.json({
          meta: { totalCount: 1 },
          result: [
            {
              id: "42",
              jobOpeningName: "Baseball Analytics Fellow",
              departmentLabel: "Baseball Operations",
              location: { city: "Toronto", state: "Ontario" },
            },
          ],
        })
      ),
      http.get("https://testco.bamboohr.com/careers/42/detail", () =>
        HttpResponse.json({
          result: { jobOpening: { description: "<p>Analyze player performance data.</p>" } },
        })
      )
    );

    const postings = await bambooHrAdapter.fetchPostings({
      company: "testco",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "42",
      title: "Baseball Analytics Fellow",
      organization: "Test Team",
      location: "Toronto, Ontario",
      category: "BASEBALL_ANALYTICS",
      url: "https://testco.bamboohr.com/careers/42",
      description: "<p>Analyze player performance data.</p>",
    });
  });

  it("still returns a posting with no description if the detail fetch fails", async () => {
    server.use(
      http.get("https://detailfail.bamboohr.com/careers/list", () =>
        HttpResponse.json({ result: [{ id: "1", jobOpeningName: "Usher" }] })
      ),
      http.get("https://detailfail.bamboohr.com/careers/1/detail", () => HttpResponse.json({}, { status: 500 }))
    );

    const postings = await bambooHrAdapter.fetchPostings({
      company: "detailfail",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0].description).toBeUndefined();
  });

  it("throws on a non-OK response from the list endpoint", async () => {
    server.use(
      http.get("https://badco.bamboohr.com/careers/list", () => HttpResponse.json({}, { status: 500 }))
    );
    await expect(
      bambooHrAdapter.fetchPostings({ company: "badco", organizationName: "Bad Co" })
    ).rejects.toThrow(/BambooHR fetch failed/);
  });
});

describe("aaimtrackAdapter", () => {
  it("maps jobs to NormalizedPosting", async () => {
    server.use(
      http.get("https://testco.aaimtrack.com/core/jobs/1234", () =>
        HttpResponse.json({
          success: true,
          data: {
            jobs: [
              {
                id: 999,
                title: " Baseball Analytics Fellow ",
                city: "St. Louis",
                stateName: "Missouri",
                jobUrl: "https://testco.aaimtrack.com/jobs/999",
              },
            ],
          },
        })
      )
    );

    const postings = await aaimtrackAdapter.fetchPostings({
      subdomain: "testco",
      domainId: "1234",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "999",
      title: "Baseball Analytics Fellow",
      organization: "Test Team",
      location: "St. Louis, Missouri",
      category: "BASEBALL_ANALYTICS",
      url: "https://testco.aaimtrack.com/jobs/999",
    });
  });

  it("returns an empty array when there are no jobs", async () => {
    server.use(
      http.get("https://empty.aaimtrack.com/core/jobs/1", () =>
        HttpResponse.json({ success: true, data: { jobs: [] } })
      )
    );
    const postings = await aaimtrackAdapter.fetchPostings({
      subdomain: "empty",
      domainId: "1",
      organizationName: "Empty Co",
    });
    expect(postings).toEqual([]);
  });

  it("throws on a non-OK response", async () => {
    server.use(
      http.get("https://bad.aaimtrack.com/core/jobs/1", () => HttpResponse.json({}, { status: 500 }))
    );
    await expect(
      aaimtrackAdapter.fetchPostings({ subdomain: "bad", domainId: "1", organizationName: "Bad Co" })
    ).rejects.toThrow(/aaimtrack fetch failed/);
  });
});

describe("teamworkOnlineAdapter", () => {
  const LISTING_HTML = `<html><body>
    <a href="/baseball-jobs/testorg/testorg/sort-header">Sort</a>
    <a href="/baseball-jobs/testorg/testorg/data-analyst-baseball-2181938">Data Analyst</a>
  </body></html>`;

  const DETAIL_HTML = `<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "http://schema.org",
    "@type": "JobPosting",
    title: "Data Analyst, Baseball Operations",
    datePosted: "2026-01-01",
    identifier: { "@type": "PropertyValue", name: "TeamWork Online", value: 2181938 },
    description: "Baseball analytics role",
    jobLocation: [{ "@type": "Place", address: { addressLocality: "Miami", addressRegion: "FL" } }],
  })}</script></head><body></body></html>`;

  it("scrapes the listing page then parses JSON-LD off each detail page", async () => {
    server.use(
      http.get("https://www.teamworkonline.com/baseball-jobs/testorg/testorg", () =>
        HttpResponse.html(LISTING_HTML)
      ),
      http.get(
        "https://www.teamworkonline.com/baseball-jobs/testorg/testorg/data-analyst-baseball-2181938",
        () => HttpResponse.html(DETAIL_HTML)
      )
    );

    const postings = await teamworkOnlineAdapter.fetchPostings({
      orgPath: "testorg/testorg",
      organizationName: "Test Team",
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "2181938",
      title: "Data Analyst, Baseball Operations",
      organization: "Test Team",
      location: "Miami, FL",
      category: "BASEBALL_ANALYTICS",
      url: "https://www.teamworkonline.com/baseball-jobs/testorg/testorg/data-analyst-baseball-2181938",
    });
  });

  it("throws on a non-OK listing response", async () => {
    server.use(
      http.get("https://www.teamworkonline.com/baseball-jobs/badorg/badorg", () =>
        HttpResponse.text("blocked", { status: 403 })
      )
    );
    await expect(
      teamworkOnlineAdapter.fetchPostings({ orgPath: "badorg/badorg", organizationName: "Bad Co" })
    ).rejects.toThrow(/TeamWork Online fetch failed/);
  });

  it("throws when the listing is non-empty but EVERY detail page fails to parse (format/selector rot, not a real empty board)", async () => {
    server.use(
      http.get("https://www.teamworkonline.com/baseball-jobs/emptyorg/emptyorg", () =>
        HttpResponse.html(`<a href="/baseball-jobs/emptyorg/emptyorg/broken-link-1">Broken</a>`)
      ),
      http.get("https://www.teamworkonline.com/baseball-jobs/emptyorg/emptyorg/broken-link-1", () =>
        HttpResponse.html("<html><body>no jsonld here</body></html>")
      )
    );
    await expect(
      teamworkOnlineAdapter.fetchPostings({
        orgPath: "emptyorg/emptyorg",
        organizationName: "Empty Co",
      })
    ).rejects.toThrow(/every detail page failed to parse/);
  });

  it("returns the successful postings when SOME detail pages fail but not all (one bad posting doesn't abort the org)", async () => {
    server.use(
      http.get("https://www.teamworkonline.com/baseball-jobs/mixedorg/mixedorg", () =>
        HttpResponse.html(`
          <a href="/baseball-jobs/mixedorg/mixedorg/good-link-2181938">Good</a>
          <a href="/baseball-jobs/mixedorg/mixedorg/broken-link-1234567">Broken</a>
        `)
      ),
      http.get(
        "https://www.teamworkonline.com/baseball-jobs/mixedorg/mixedorg/good-link-2181938",
        () => HttpResponse.html(DETAIL_HTML)
      ),
      http.get(
        "https://www.teamworkonline.com/baseball-jobs/mixedorg/mixedorg/broken-link-1234567",
        () => HttpResponse.html("<html><body>no jsonld here</body></html>")
      )
    );
    const postings = await teamworkOnlineAdapter.fetchPostings({
      orgPath: "mixedorg/mixedorg",
      organizationName: "Mixed Co",
    });
    expect(postings).toHaveLength(1);
    expect(postings[0].externalId).toBe("2181938");
  });
});
