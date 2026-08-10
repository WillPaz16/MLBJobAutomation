import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string };
  createdAt?: number;
  descriptionPlain?: string;
}

interface LeverConfig {
  site: string;
  organizationName: string;
}

export const leverAdapter: Adapter = {
  sourceName: "lever",
  sourceType: "lever",
  async fetchPostings(config: LeverConfig): Promise<NormalizedPosting[]> {
    const { site, organizationName } = config;
    const res = await fetch(`https://api.lever.co/v0/postings/${site}?mode=json`);
    if (!res.ok) {
      throw new Error(`Lever fetch failed for ${site}: ${res.status} ${res.statusText}`);
    }
    const jobs = (await res.json()) as LeverJob[];

    return jobs.map((job) => ({
      externalId: job.id,
      title: job.text,
      organization: organizationName,
      location: job.categories?.location,
      category: categorize(job.text, organizationName, job.descriptionPlain),
      url: job.hostedUrl,
      description: job.descriptionPlain,
      postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
    }));
  },
};
