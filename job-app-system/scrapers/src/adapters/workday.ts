import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface WorkdayJobPosting {
  title: string;
  externalPath: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
}

interface WorkdayConfig {
  // e.g. for https://my1060wd.wd5.myworkdayjobs.com/Chicago_Cubs_FO
  //   tenant: "my1060wd", host: "my1060wd.wd5.myworkdayjobs.com", site: "Chicago_Cubs_FO"
  tenant: string;
  host: string;
  site: string;
  organizationName: string;
}

export const workdayAdapter: Adapter = {
  sourceName: "workday",
  sourceType: "workday",
  async fetchPostings(config: WorkdayConfig): Promise<NormalizedPosting[]> {
    const { tenant, host, site, organizationName } = config;
    const url = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
    const postings: NormalizedPosting[] = [];
    const pageSize = 20;
    let offset = 0;
    let total = Infinity;

    while (offset < total) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: pageSize, offset, searchText: "" }),
      });
      if (!res.ok) {
        throw new Error(`Workday fetch failed for ${site}: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { total: number; jobPostings: WorkdayJobPosting[] };
      total = data.total;

      for (const job of data.jobPostings) {
        const externalId = job.bulletFields?.[0] ?? job.externalPath;
        postings.push({
          externalId,
          title: job.title,
          organization: organizationName,
          location: job.locationsText,
          category: categorize(job.title, organizationName),
          url: `https://${host}/en-US/${site}${job.externalPath}`,
        });
      }

      offset += pageSize;
      if (data.jobPostings.length === 0) break;
    }

    return postings;
  },
};
