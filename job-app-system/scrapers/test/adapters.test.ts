import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { greenhouseAdapter } from "../src/adapters/greenhouse.js";
import { leverAdapter } from "../src/adapters/lever.js";
import { workdayAdapter } from "../src/adapters/workday.js";
import { adpAdapter } from "../src/adapters/adp.js";
import { ukgAdapter } from "../src/adapters/ukg.js";

describe("greenhouseAdapter", () => {
  it("maps jobs to NormalizedPosting", async () => {
    server.use(
      http.get("https://boards-api.greenhouse.io/v1/boards/testco/jobs", () =>
        HttpResponse.json({
          jobs: [
            {
              id: 123,
              title: "Data Scientist",
              absolute_url: "https://boards.greenhouse.io/testco/jobs/123",
              location: { name: "Remote" },
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        })
      )
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
});

describe("leverAdapter", () => {
  it("maps postings to NormalizedPosting", async () => {
    server.use(
      http.get("https://api.lever.co/v0/postings/testco", () =>
        HttpResponse.json([
          {
            id: "abc-123",
            text: "Machine Learning Engineer",
            hostedUrl: "https://jobs.lever.co/testco/abc-123",
            categories: { location: "New York, NY" },
            createdAt: 1735689600000,
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
  it("paginates until an empty page and maps postings", async () => {
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
      })
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
    });
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
