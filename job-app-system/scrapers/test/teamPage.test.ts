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

const EMPTY_HTML = `<!DOCTYPE html><html><body>
  <p>We do not currently have any open jobs. Please check back later.</p>
</body></html>`;

const DETAIL_HTML = `<!DOCTYPE html><html><body>
  <div class="job-description">Sell Brewers gear at the team store.</div>
</body></html>`;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader("Content-Type", "text/html");
    if (req.url?.startsWith("/inner")) res.end(INNER_HTML);
    else if (req.url?.startsWith("/empty")) res.end(EMPTY_HTML);
    else if (req.url?.startsWith("/jobs/1/retail-associate")) res.end(DETAIL_HTML);
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

  it("fetches description from the detail page when descriptionSelector is set", async () => {
    const postings = await teamPageAdapter.fetchPostings({
      organizationName: "Milwaukee Brewers",
      listUrl: baseUrl,
      frameUrlContains: "in_iframe=1",
      cardSelector: ".row.job",
      titleSelector: "a.title",
      linkSelector: "a.title",
      locationSelector: ".location",
      descriptionSelector: ".job-description",
    });

    expect(postings).toHaveLength(2);
    expect(postings[0].description).toBe("Sell Brewers gear at the team store.");
    // Second posting's detail page 404s in this fixture — should still return a posting, just
    // with no description, not throw and drop the whole batch.
    expect(postings[1].description).toBeUndefined();
  }, 20000);

  it("does not fetch a description at all when descriptionSelector is omitted", async () => {
    const postings = await teamPageAdapter.fetchPostings({
      organizationName: "Milwaukee Brewers",
      listUrl: baseUrl,
      frameUrlContains: "in_iframe=1",
      cardSelector: ".row.job",
      titleSelector: "a.title",
      linkSelector: "a.title",
    });
    expect(postings[0].description).toBeUndefined();
  });

  it("returns an empty array rather than throwing when emptyStateSelector confirms a genuine empty board", async () => {
    const postings = await teamPageAdapter.fetchPostings({
      organizationName: "Test Team",
      listUrl: `${baseUrl}/empty`,
      cardSelector: ".row.job",
      titleSelector: "a.title",
      linkSelector: "a.title",
      emptyStateSelector: "p",
    });
    expect(postings).toEqual([]);
  }, 20000);

  it("throws on a cardSelector timeout when no emptyStateSelector is configured (can't tell rot from real empty)", async () => {
    await expect(
      teamPageAdapter.fetchPostings({
        organizationName: "Test Team",
        listUrl: `${baseUrl}/empty`,
        cardSelector: ".row.job",
        titleSelector: "a.title",
        linkSelector: "a.title",
      })
    ).rejects.toThrow(/never appeared/);
  }, 20000);

  it("throws on a cardSelector timeout when emptyStateSelector is configured but not found", async () => {
    await expect(
      teamPageAdapter.fetchPostings({
        organizationName: "Test Team",
        listUrl: `${baseUrl}/empty`,
        cardSelector: ".row.job",
        titleSelector: "a.title",
        linkSelector: "a.title",
        emptyStateSelector: ".no-such-marker",
      })
    ).rejects.toThrow(/never appeared/);
  }, 20000);

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
