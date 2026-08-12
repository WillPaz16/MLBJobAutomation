import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./mockServer.js";
import { newGradListAdapter } from "../src/adapters/newGradList.js";

const README_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md";

const TABLE_HEAD = `<table style="width: 100%; border-collapse: collapse;">
<thead>
<tr>
<th>Company</th>
<th>Role</th>
<th>Location</th>
<th>Application</th>
<th>Age</th>
</tr>
</thead>
<tbody>`;

const FIXTURE = `
## 💻 Software Engineering New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/ShouldNotAppear?utm_source=GHList&utm_medium=company">Should Not Appear</a></strong></td>
<td>Software Engineer New Grad</td>
<td>Remote</td>
<td><div align="center"><a href="https://boards.greenhouse.io/shouldnotappear/jobs/1"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/aaa?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>1d</td>
</tr>
</tbody>
</table>

## 🤖 Data Science, AI & Machine Learning New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/PathAI?utm_source=GHList&utm_medium=company">PathAI</a></strong></td>
<td>Data Scientist I</td>
<td>Boston, MA</td>
<td><div align="center"><a href="https://www.pathai.com/careers/8696764002?gh_jid=8696764002&utm_source=Simplify&ref=Simplify"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/bbb?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>0d</td>
</tr>
<tr>
<td><strong><a href="https://simplify.jobs/c/Apple?utm_source=GHList&utm_medium=company">🔥 Apple</a></strong></td>
<td>Machine Learning Engineer, New Grad</td>
<td>Cupertino, CA</td>
<td><div align="center"><a href="https://jobs.apple.com/en-us/details/12345"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/ccc?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>0d</td>
</tr>
<tr>
<td><strong><a href="https://simplify.jobs/c/SecretiveCo?utm_source=GHList&utm_medium=company">🛂 SecretiveCo</a></strong></td>
<td>Data Analyst</td>
<td>New York, NY</td>
<td><div align="center"><a href="https://apply.workable.com/secretiveco/j/XYZ/apply"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/ddd?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>2d</td>
</tr>
</tbody>
</table>

## 📱 Product Management New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/Meta?utm_source=GHList&utm_medium=company">🔥 Meta</a></strong></td>
<td>Product Manager, New Grad</td>
<td>Menlo Park, CA</td>
<td><div align="center"><a href="https://www.metacareers.com/jobs/999"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/eee?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>0d</td>
</tr>
</tbody>
</table>

## 📈 Quantitative Finance New Grad Roles

${TABLE_HEAD}
<tr>
<td><strong><a href="https://simplify.jobs/c/ExxonMobil?utm_source=GHList&utm_medium=company">ExxonMobil</a></strong></td>
<td>Quantitative Analyst</td>
<td>Houston, TX</td>
<td><div align="center"><a href="https://jobs.exxonmobil.com/apply/1"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/fff?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>3d</td>
</tr>
<tr>
<td>↳</td>
<td>Quantitative Researcher</td>
<td>Houston, TX</td>
<td><div align="center"><a href="https://jobs.exxonmobil.com/apply/2"><img src="x" width="52" alt="Apply"></a> <a href="https://simplify.jobs/p/ggg?utm_source=GHList"><img src="y" width="28" alt="Simplify"></a></div></td>
<td>3d</td>
</tr>
</tbody>
</table>
`;

const SECTIONS = ["Data Science, AI & Machine Learning", "Quantitative Finance", "Product Management"];

describe("newGradListAdapter", () => {
  it("only pulls rows from the specified sections, skipping excluded ones", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));

    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    expect(postings.some((p) => p.organization === "Should Not Appear")).toBe(false);
    expect(postings).toHaveLength(6);
  });

  it("resolves a '↳' company cell to the immediately preceding row's organization", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    const secondExxon = postings.find((p) => p.title === "Quantitative Researcher");
    expect(secondExxon?.organization).toBe("ExxonMobil");
  });

  it("strips leading legend/FAANG+ emoji from the organization name", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    const apple = postings.find((p) => p.title === "Machine Learning Engineer, New Grad");
    expect(apple?.organization).toBe("Apple");

    const secretive = postings.find((p) => p.title === "Data Analyst");
    expect(secretive?.organization).toBe("SecretiveCo");

    const meta = postings.find((p) => p.title === "Product Manager, New Grad");
    expect(meta?.organization).toBe("Meta");
  });

  it("extracts the real apply link, not the simplify.jobs tracking or company-profile link", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    const pathAI = postings.find((p) => p.organization === "PathAI");
    expect(pathAI?.url).toBe("https://www.pathai.com/careers/8696764002?gh_jid=8696764002&utm_source=Simplify&ref=Simplify");
    expect(pathAI?.url).not.toContain("simplify.jobs");
  });

  it("extracts title and location verbatim", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    const exxon = postings.find((p) => p.organization === "ExxonMobil");
    expect(exxon?.title).toBe("Quantitative Analyst");
    expect(exxon?.location).toBe("Houston, TX");
  });

  it("maps category per-section: DS/ML and Quant Finance to DATA_SCIENCE, PM to OTHER", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    expect(postings.find((p) => p.organization === "PathAI")?.category).toBe("DATA_SCIENCE");
    expect(postings.find((p) => p.organization === "ExxonMobil")?.category).toBe("DATA_SCIENCE");
    expect(postings.find((p) => p.organization === "Meta")?.category).toBe("OTHER");
  });

  it("derives a stable sha256-based externalId from the apply url, stable across two parses", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const first = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const second = await newGradListAdapter.fetchPostings({ sections: SECTIONS });

    const pathAI1 = first.find((p) => p.organization === "PathAI");
    const pathAI2 = second.find((p) => p.organization === "PathAI");
    expect(pathAI1?.externalId).toBe(pathAI2?.externalId);
    expect(pathAI1?.externalId).toBe(createHash("sha256").update(pathAI1!.url).digest("hex"));
  });

  it("leaves description undefined (this source has no job description text)", async () => {
    server.use(http.get(README_URL, () => HttpResponse.text(FIXTURE)));
    const postings = await newGradListAdapter.fetchPostings({ sections: SECTIONS });
    expect(postings.every((p) => p.description === undefined)).toBe(true);
  });
});
