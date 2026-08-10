import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { createServer, type Server } from "http";
import { teamPageAdapter } from "../src/adapters/teamPage.js";

// Real integration test against a local HTTP fixture (outer page + nested same-origin iframe)
// rather than mocking Playwright's browser — exercises the actual frame-finding logic, which
// is the part of this adapter most likely to silently break against a real site's markup.
let server: Server;
let baseUrl: string;

const OUTER_HTML = `<!DOCTYPE html><html><body>
  <iframe src="/inner?in_iframe=1"></iframe>
</body></html>`;

const INNER_HTML = `<!DOCTYPE html><html><body>
  <div class="row"><span class="sort-header">Sort controls, not a job</span></div>
  <div class="row job">
    <span class="location">US-WI-Milwaukee</span>
    <a class="title" href="/jobs/1/retail-associate">Retail Sales Associate</a>
  </div>
  <div class="row job">
    <span class="location">US-WI-Milwaukee</span>
    <a class="title" href="/jobs/2/gate-screener">Gate Screener</a>
  </div>
</body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    if (req.url?.startsWith("/inner")) res.end(INNER_HTML);
    else res.end(OUTER_HTML);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

describe("teamPageAdapter", () => {
  it("finds cards inside a nested same-origin iframe and skips non-job rows", async () => {
    const postings = await teamPageAdapter.fetchPostings({
      organizationName: "Milwaukee Brewers",
      listUrl: baseUrl,
      frameUrlContains: "in_iframe=1",
      cardSelector: ".row.job",
      titleSelector: "a.title",
      linkSelector: "a.title",
      locationSelector: ".location",
    });

    expect(postings).toHaveLength(2);
    expect(postings[0]).toMatchObject({
      title: "Retail Sales Associate",
      organization: "Milwaukee Brewers",
      location: "US-WI-Milwaukee",
      url: `${baseUrl}/jobs/1/retail-associate`,
    });
  });

  it("throws if the expected frame never appears", async () => {
    await expect(
      teamPageAdapter.fetchPostings({
        organizationName: "Test Team",
        listUrl: baseUrl,
        frameUrlContains: "does-not-exist",
        cardSelector: ".row.job",
        titleSelector: "a.title",
        linkSelector: "a.title",
      })
    ).rejects.toThrow(/No frame found/);
  }, 20000);
});
