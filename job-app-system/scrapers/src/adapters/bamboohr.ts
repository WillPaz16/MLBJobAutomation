import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface BambooJob {
  id: string;
  jobOpeningName: string;
  departmentLabel?: string;
  location?: { city?: string; state?: string };
}

interface BambooConfig {
  // From the org's careers URL: <company>.bamboohr.com/careers
  company: string;
  organizationName: string;
}

// The list endpoint above doesn't include a description — only the per-job detail endpoint does,
// under result.jobOpening.description (confirmed via live curl against the Blue Jays' board).
async function fetchJobDescription(company: string, jobId: string): Promise<string | undefined> {
  const res = await fetch(`https://${company}.bamboohr.com/careers/${jobId}/detail`);
  if (!res.ok) return undefined;
  const data = (await res.json()) as { result?: { jobOpening?: { description?: string } } };
  return data.result?.jobOpening?.description;
}

export const bambooHrAdapter: Adapter = {
  sourceName: "bamboohr",
  sourceType: "bamboohr",
  async fetchPostings(config: BambooConfig): Promise<NormalizedPosting[]> {
    const { company, organizationName } = config;
    const res = await fetch(`https://${company}.bamboohr.com/careers/list`);
    if (!res.ok) {
      throw new Error(`BambooHR fetch failed for ${company}: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { result: BambooJob[] };

    const postings: NormalizedPosting[] = [];
    for (const job of data.result) {
      const location = [job.location?.city, job.location?.state].filter(Boolean).join(", ");
      const description = await fetchJobDescription(company, job.id).catch(() => undefined);
      postings.push({
        externalId: job.id,
        title: job.jobOpeningName,
        organization: organizationName,
        location: location || undefined,
        category: categorize(job.jobOpeningName, organizationName, description),
        url: `https://${company}.bamboohr.com/careers/${job.id}`,
        description,
      });
    }
    return postings;
  },
};
