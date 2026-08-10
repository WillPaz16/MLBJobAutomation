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

    return data.result.map((job) => {
      const location = [job.location?.city, job.location?.state].filter(Boolean).join(", ");
      return {
        externalId: job.id,
        title: job.jobOpeningName,
        organization: organizationName,
        location: location || undefined,
        category: categorize(job.jobOpeningName, organizationName),
        url: `https://${company}.bamboohr.com/careers/${job.id}`,
      };
    });
  },
};
