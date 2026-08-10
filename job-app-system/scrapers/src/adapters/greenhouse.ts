import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  updated_at: string;
  content?: string;
}

interface GreenhouseConfig {
  boardToken: string;
  organizationName: string;
}

export const greenhouseAdapter: Adapter = {
  sourceName: "greenhouse",
  sourceType: "greenhouse",
  async fetchPostings(config: GreenhouseConfig): Promise<NormalizedPosting[]> {
    const { boardToken, organizationName } = config;
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`);
    if (!res.ok) {
      throw new Error(`Greenhouse fetch failed for ${boardToken}: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { jobs: GreenhouseJob[] };

    return data.jobs.map((job) => ({
      externalId: String(job.id),
      title: job.title,
      organization: organizationName,
      location: job.location?.name,
      category: categorize(job.title, organizationName, job.content),
      url: job.absolute_url,
      description: job.content,
      postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
    }));
  },
};
