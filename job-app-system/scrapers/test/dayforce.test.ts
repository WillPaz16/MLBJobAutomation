import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createServer, type Server } from "http";
import { dayforceAdapter } from "../src/adapters/dayforce.js";

// Real integration test against a local HTTP fixture that mimics the Dayforce candidate portal:
// a page whose own client-side JS fetches the jobposting/search API on load. This exercises the
// actual network-interception logic (waitForResponse), which is the part of this adapter most
// likely to silently break — mocking fetch directly wouldn't prove the Playwright response
// listener actually catches a same-origin XHR made by the page itself.
let server: Server;
let baseUrl: string;

const JOB_POSTINGS_BODY = JSON.stringify({
  jobPostings: [
    {
      jobPostingId: 228,
      jobTitle: "Analyst, Player Development - Research & Development",
      jobDescription: "Baseball analytics role using SQL and R.",
      postingStartTimestampUTC: "2026-01-01T00:00:00Z",
      postingLocations: [{ cityName: "Kansas City", stateCode: "MO" }],
    },
  ],
});

const PORTAL_HTML = `<!DOCTYPE html><html><body>
  <script>
    fetch("/api/geo/testteam/jobposting/search").then(() => {});
  </script>
</body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.includes("/api/geo/testteam/jobposting/search")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JOB_POSTINGS_BODY);
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(PORTAL_HTML);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

describe("dayforceAdapter", () => {
  it("intercepts the page's own client-side API call and maps postings", async () => {
    const postings = await dayforceAdapter.fetchPostings({
      tenant: "testteam",
      organizationName: "Test Team",
      baseUrl,
    });

    expect(postings).toHaveLength(1);
    expect(postings[0]).toMatchObject({
      externalId: "228",
      title: "Analyst, Player Development - Research & Development",
      organization: "Test Team",
      location: "Kansas City, MO",
      category: "BASEBALL_RND",
      url: `${baseUrl}/en-US/testteam/CANDIDATEPORTAL/jobs/228`,
    });
  }, 20000);

  it("returns an empty array if the API response never arrives", async () => {
    const emptyServer = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end("<html><body>no fetch here</body></html>");
    });
    await new Promise<void>((resolve) => emptyServer.listen(0, resolve));
    const address = emptyServer.address();
    const port = typeof address === "object" && address ? address.port : 0;

    const postings = await dayforceAdapter.fetchPostings({
      tenant: "testteam",
      organizationName: "Test Team",
      baseUrl: `http://localhost:${port}`,
    });

    expect(postings).toEqual([]);
    emptyServer.close();
  }, 40000);
});
