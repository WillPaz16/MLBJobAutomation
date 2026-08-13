import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { canonicalUrl, jobListRepoAdapter, FLAT_SECTION, type JobListRepoConfig } from "../src/adapters/jobListRepo.js";
import { getOrCreateSource, ingestPostings } from "../src/ingest.js";
import { runJobListRepoAdapter } from "../src/runDiscovery.js";
import { prisma } from "../src/db.js";

const README_URL = "https://example.com/README.md";

function baseHtmlConfig(overrides: Partial<JobListRepoConfig> = {}): JobListRepoConfig {
  return {
    key: "test-html-repo",
    readmeUrl: README_URL,
    tableFormat: "html",
    sectionHeaderRe: /^##\s+\S+\s+(.+?)\s+New Grad Roles\s*$/,
    sections: ["Data Science, AI & Machine Learning", "Quantitative Finance", "Product Management"],
    sectionLabel: {
      "Data Science, AI & Machine Learning": "Data Science, AI & Machine Learning",
      "Quantitative Finance": "Quantitative Finance",
      "Product Management": "Product Management",
    },
    sectionCategory: {
      "Data Science, AI & Machine Learning": "DATA_SCIENCE",
      "Quantitative Finance": "DATA_SCIENCE",
      "Product Management": "OTHER",
    },
    columns: { company: 0, title: 1, location: 2, apply: 3 },
    minCells: 4,
    minExpectedPostings: 0,
    ...overrides,
  };
}

const TABLE_HEAD = `<table style="width: 100%;">
<thead>
<tr><th>Company</th><th>Role</th><th>Location</th><th>Application</th><th>Age</th></tr>
</thead>
<tbody>`;

const HTML_FIXTURE = `
## 🤖 Data Science, AI & Machine Learning New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/PathAI?utm_source=GHList">PathAI</a></strong></td>
<td>Data Scientist I</td>
<td>Boston, MA</td>
<td><div align="center"><a href="https://www.pathai.com/careers/1?utm_source=Simplify&ref=Simplify"><img src="x" alt="Apply"></a> <a href="https://simplify.jobs/p/bbb"><img src="y" alt="Simplify"></a></div></td>
<td>0d</td>
</tr>
</tbody>
</table>

## 📈 Quantitative Finance New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/ExxonMobil">ExxonMobil</a></strong></td>
<td>Quantitative Analyst</td>
<td>Houston, TX</td>
<td><div align="center"><a href="https://jobs.exxonmobil.com/apply/1"><img src="x" alt="Apply"></a></div></td>
<td>3d</td>
</tr>
<tr>
<td>↳</td>
<td>Quantitative Researcher</td>
<td>Houston, TX</td>
<td><div align="center"><a href="https://jobs.exxonmobil.com/apply/2"><img src="x" alt="Apply"></a></div></td>
<td>3d</td>
</tr>
</tbody>
</table>

## 📱 Product Management New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/Meta">🔥 Meta</a></strong></td>
<td>Product Manager, New Grad</td>
<td>Menlo Park, CA</td>
<td><div align="center"><a href="https://www.metacareers.com/jobs/999"><img src="x" alt="Apply"></a></div></td>
<td>0d</td>
</tr>
</tbody>
</table>
`;

describe("jobListRepoAdapter — html table format", () => {
  it("parses org/title/location/url and applies per-section category", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(HTML_FIXTURE)));
    const postings = await jobListRepoAdapter.fetchPostings(baseHtmlConfig());

    expect(postings).toHaveLength(4);
    const pathAI = postings.find((p) => p.organization === "PathAI");
    expect(pathAI?.title).toBe("Data Scientist I");
    expect(pathAI?.category).toBe("DATA_SCIENCE");
    expect(pathAI?.url).toBe("https://www.pathai.com/careers/1?utm_source=Simplify&ref=Simplify");

    const pm = postings.find((p) => p.organization === "Meta");
    expect(pm?.category).toBe("OTHER");
  });

  it("resolves a '↳' company cell to the preceding row's organization", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(HTML_FIXTURE)));
    const postings = await jobListRepoAdapter.fetchPostings(baseHtmlConfig());
    const researcher = postings.find((p) => p.title === "Quantitative Researcher");
    expect(researcher?.organization).toBe("ExxonMobil");
  });

  it("throws when a configured section is not found, rather than silently skipping it", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(HTML_FIXTURE)));
    const cfg = baseHtmlConfig({ sections: ["Data Science, AI & Machine Learning", "Nonexistent Section"] });
    await expect(jobListRepoAdapter.fetchPostings(cfg)).rejects.toThrow(/section "Nonexistent Section" not found/);
  });

  it("throws when total parsed rows are below minExpectedPostings", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(HTML_FIXTURE)));
    const cfg = baseHtmlConfig({ minExpectedPostings: 100 });
    await expect(jobListRepoAdapter.fetchPostings(cfg)).rejects.toThrow(/below minExpectedPostings/);
  });
});

const PIPE_FIXTURE_VANSH = `
| Company | Role | Location | Application/Link | Date Posted |
| --- | --- | --- | :---: | :---: |
| **Quora** | New Grad: Software Engineer | Remote | <a href="https://jobs.ashbyhq.com/quora/abc?utm_source=vansh"><img src="x" alt="Apply"></a> | Aug 05 |
| **Chicago Trading Company** | New Grad 2027: Data Scientist | Chicago, IL</br>New York, NY | <a href="https://job-boards.greenhouse.io/ctc/jobs/1?utm_source=vansh"><img src="x" alt="Apply"></a> | Aug 01 |
| **U.S. Bank** | Software Engineer 1 (Backend) | Earth City, MO | 🔒 | Jul 09 |
| **Acme Sales Co** | Data Scientist, Sales Enablement | Remote | <a href="https://acme.com/apply/1?utm_source=vansh"><img src="x" alt="Apply"></a> | Jul 08 |
`;

function vanshConfig(overrides: Partial<JobListRepoConfig> = {}): JobListRepoConfig {
  return {
    key: "test-vansh",
    readmeUrl: README_URL,
    tableFormat: "pipe",
    sectionHeaderRe: null,
    sections: [FLAT_SECTION],
    sectionLabel: { [FLAT_SECTION]: "Data Science, AI & Machine Learning" },
    sectionCategory: { [FLAT_SECTION]: "DATA_SCIENCE" },
    columns: { company: 0, title: 1, location: 2, apply: 3 },
    minCells: 4,
    titleIncludeRe: /data scien/i,
    titleExcludeRe: /\bsales\b/i,
    minExpectedPostings: 0,
    ...overrides,
  };
}

describe("jobListRepoAdapter — pipe table format (vansh-shaped, flat/no section headers)", () => {
  it("throws at fetch time when sectionHeaderRe is null and titleIncludeRe is unset", async () => {
    const cfg = vanshConfig({ titleIncludeRe: undefined });
    await expect(jobListRepoAdapter.fetchPostings(cfg)).rejects.toThrow(/titleIncludeRe/);
  });

  it("strips markdown bold from company cells and handles </br> as a location separator", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(PIPE_FIXTURE_VANSH)));
    const postings = await jobListRepoAdapter.fetchPostings(vanshConfig());
    const ctc = postings.find((p) => p.organization === "Chicago Trading Company");
    expect(ctc?.location).toBe("Chicago, IL; New York, NY");
  });

  it("skips a bare 🔒-locked row with no real href, without crashing", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(PIPE_FIXTURE_VANSH)));
    const postings = await jobListRepoAdapter.fetchPostings(vanshConfig());
    expect(postings.some((p) => p.organization === "U.S. Bank")).toBe(false);
  });

  it("applies titleIncludeRe and titleExcludeRe as a row-level gate", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(PIPE_FIXTURE_VANSH)));
    const postings = await jobListRepoAdapter.fetchPostings(vanshConfig());
    // Quora's SWE role doesn't match titleIncludeRe.
    expect(postings.some((p) => p.organization === "Quora")).toBe(false);
    // Acme's role matches titleIncludeRe but also titleExcludeRe ("Sales").
    expect(postings.some((p) => p.organization === "Acme Sales Co")).toBe(false);
    // CTC's "Data Scientist" role matches include and not exclude.
    expect(postings.some((p) => p.organization === "Chicago Trading Company")).toBe(true);
  });
});

const PIPE_FIXTURE_SPEEDY_OTHER = `
### Other

| Company | Position | Location | Posting | Age |
|---|---|---|---|---|
| <a href="https://opus.pro/"><strong>OpusClip</strong></a> | AI Product Management Intern | Mountain View, CA | <a href="https://jobs.ashbyhq.com/opusclip/1"><img src="x" alt="Apply"></a> | 0d |
| <a href="https://acme.com"><strong>Acme</strong></a> | Warehouse Associate | Dallas, TX | <a href="https://acme.com/apply/2"><img src="x" alt="Apply"></a> | 1d |
`;

const PIPE_FIXTURE_SPEEDY_QUANT = `
### Quant

| Company | Position | Location | Salary | Posting | Age |
|---|---|---|---|---|---|
| <a href="https://www.citadel.com"><strong>Citadel</strong></a> | Quantitative Researcher Intern | New York, NY | $125/hr | <a href="https://www.citadel.com/apply/1"><img src="x" alt="Apply"></a> | 0d |
`;

function speedyConfig(): JobListRepoConfig {
  return {
    key: "test-speedy",
    readmeUrl: README_URL,
    tableFormat: "pipe",
    sectionHeaderRe: /^###\s+(.+?)\s*$/,
    sections: ["Quant", "Other"],
    sectionLabel: { Quant: "Quantitative Finance", Other: "Data Science, AI & Machine Learning" },
    sectionCategory: { Quant: "DATA_SCIENCE", Other: "DATA_SCIENCE" },
    // Deliberately mismatched apply index (4, correct for Quant's 6-column layout but wrong for
    // Other's 5-column layout) — this is the whole point of the alt="Apply" signature search.
    columns: { company: 0, title: 1, location: 2, apply: 4, salary: 3 },
    minCells: 4,
    titleIncludeRe: /\b(ai|product|quant\w*)\b/i,
    minExpectedPostings: 0,
  };
}

describe("jobListRepoAdapter — pipe table format (speedyapply-shaped, variable column count per section)", () => {
  it("finds the real apply link via the alt=\"Apply\" signature even when column counts differ across sections", async () => {
    server.use(
      http.get(README_URL, () =>
        HttpResponse.text(PIPE_FIXTURE_SPEEDY_QUANT + "\n" + PIPE_FIXTURE_SPEEDY_OTHER)
      )
    );
    const postings = await jobListRepoAdapter.fetchPostings(speedyConfig());

    const citadel = postings.find((p) => p.organization === "Citadel");
    expect(citadel?.url).toBe("https://www.citadel.com/apply/1");

    const opus = postings.find((p) => p.organization === "OpusClip");
    expect(opus?.url).toBe("https://jobs.ashbyhq.com/opusclip/1");

    // Warehouse Associate doesn't match titleIncludeRe.
    expect(postings.some((p) => p.organization === "Acme")).toBe(false);
  });
});

describe("canonicalUrl", () => {
  it("strips utm_*, ref, source, gh_src params, the hash, and a trailing slash", () => {
    expect(canonicalUrl("https://example.com/job/1?utm_source=Simplify&ref=Simplify")).toBe(
      "https://example.com/job/1"
    );
    expect(canonicalUrl("https://example.com/job/2?utm_source=vansh")).toBe("https://example.com/job/2");
    expect(canonicalUrl("https://example.com/job/3?gh_src=abc#section")).toBe("https://example.com/job/3");
    expect(canonicalUrl("https://example.com/job/4/")).toBe("https://example.com/job/4");
  });

  it("makes the same underlying job hash identically across different repos' tracking params", () => {
    const a = canonicalUrl("https://example.com/job/1?utm_source=Simplify&ref=Simplify");
    const b = canonicalUrl("https://example.com/job/1?utm_source=vansh");
    const c = canonicalUrl("https://example.com/job/1");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("falls back to the raw string on an unparseable URL rather than throwing", () => {
    expect(canonicalUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("jobListRepoAdapter — externalId uses canonicalUrl", () => {
  it("hashes sha256(canonicalUrl(url)), not sha256(url)", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(HTML_FIXTURE)));
    const postings = await jobListRepoAdapter.fetchPostings(baseHtmlConfig());
    const pathAI = postings.find((p) => p.organization === "PathAI")!;
    expect(pathAI.externalId).toBe(createHash("sha256").update(canonicalUrl(pathAI.url)).digest("hex"));
    expect(pathAI.externalId).not.toBe(createHash("sha256").update(pathAI.url).digest("hex"));
  });
});

describe("runJobListRepoAdapter — the dynamic DB-relative floor (guard layer 3)", () => {
  it("throws and calls ingestPostings for NO org when parsed count is < 50% of prior active count", async () => {
    const cfg = baseHtmlConfig({ key: "dynamic-floor-test", minExpectedPostings: 0 });

    // Seed 10 "prior active" postings for this source/org so the dynamic floor has something to
    // compare against.
    const source = await getOrCreateSource(cfg.key, "job-list-repo");
    for (let i = 0; i < 10; i++) {
      await prisma.posting.create({
        data: {
          sourceId: source.id,
          externalId: `prior-${i}`,
          title: `Prior Posting ${i}`,
          organization: "PathAI",
          category: "DATA_SCIENCE",
          url: `https://example.com/prior/${i}`,
          lastSeenAt: new Date(),
        },
      });
    }

    // HTML_FIXTURE parses to 3 postings total — well under 50% of 10.
    server.use(http.get(README_URL, () => HttpResponse.text(HTML_FIXTURE)));

    const inserted = await runJobListRepoAdapter(cfg);
    expect(inserted).toBe(0);

    // No new rows beyond the 10 seeded ones, and none of the 10 were closed.
    const rows = await prisma.posting.findMany({ where: { sourceId: source.id } });
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.closedAt === null)).toBe(true);
  });
});
