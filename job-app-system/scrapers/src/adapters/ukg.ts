import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface UkgOpportunity {
  Id: string;
  Title: string;
  RequisitionNumber: string;
  PostedDate?: string;
  BriefDescription?: string;
  Locations?: {
    LocalizedDescription?: string | null;
    Address?: { City?: string; State?: { Code?: string } };
  }[];
}

interface UkgConfig {
  // From the org's career board URL: https://<host>/<tenant>/JobBoard/<boardId>/...
  host: string; // e.g. "recruiting.ultipro.com" or "<org>.rec.pro.ukg.net" or "recruiting2.ultipro.com"
  tenant: string;
  boardId: string;
  organizationName: string;
}

function formatLocation(loc?: UkgOpportunity["Locations"] extends (infer T)[] | undefined ? T : never) {
  if (!loc) return undefined;
  if (loc.LocalizedDescription) return loc.LocalizedDescription;
  const city = loc.Address?.City;
  const state = loc.Address?.State?.Code;
  return [city, state].filter(Boolean).join(", ") || undefined;
}

export const ukgAdapter: Adapter = {
  sourceName: "ukg",
  sourceType: "ukg",
  async fetchPostings(config: UkgConfig): Promise<NormalizedPosting[]> {
    const { host, tenant, boardId, organizationName } = config;
    const url = `https://${host}/${tenant}/JobBoard/${boardId}/JobBoardView/LoadSearchResults`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        opportunitySearch: { OpportunitySearchText: "", OpportunityLocations: [], OpportunityCategories: [] },
      }),
    });
    if (!res.ok) {
      throw new Error(`UKG fetch failed for ${tenant}: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { opportunities: UkgOpportunity[] };

    return data.opportunities.map((job) => ({
      externalId: job.Id,
      title: job.Title,
      organization: organizationName,
      location: formatLocation(job.Locations?.[0]),
      category: categorize(job.Title, organizationName, job.BriefDescription),
      url: `https://${host}/${tenant}/JobBoard/${boardId}/OpportunityDetail?opportunityId=${job.Id}`,
      description: job.BriefDescription,
      postedAt: job.PostedDate ? new Date(job.PostedDate) : undefined,
    }));
  },
};
