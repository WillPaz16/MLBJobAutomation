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
  // Most orgs run a single Greenhouse board. A few (Phillies, Athletics) run two separate boards
  // for the same real-world organization — boardTokens lets one config entry fetch and merge both
  // into a single NormalizedPosting[], so runDiscovery/ingestPostings only ever see ONE call for
  // that org (see sources.config.ts comment + CLAUDE.md/v9-plan Phase 4 task 3 for why this
  // matters: ingestPostings' closing pass is scoped to (sourceId, organization) together, and two
  // boards sharing one organizationName under separate ingestPostings calls would each run the
  // closing pass against the OTHER board's postings too).
  boardToken?: string;
  boardTokens?: string[];
  organizationName: string;
}

async function fetchBoard(boardToken: string, organizationName: string): Promise<NormalizedPosting[]> {
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
}

export const greenhouseAdapter: Adapter = {
  sourceName: "greenhouse",
  sourceType: "greenhouse",
  async fetchPostings(config: GreenhouseConfig): Promise<NormalizedPosting[]> {
    const { boardToken, boardTokens, organizationName } = config;
    const tokens = boardTokens ?? (boardToken ? [boardToken] : []);
    const results = await Promise.all(tokens.map((token) => fetchBoard(token, organizationName)));
    return results.flat();
  },
};
