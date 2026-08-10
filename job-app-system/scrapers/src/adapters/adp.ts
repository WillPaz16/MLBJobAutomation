import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface AdpJobRequisition {
  itemID: string;
  requisitionTitle: string;
  postDate?: string;
  requisitionLocations?: { nameCode?: { shortName?: string } }[];
}

interface AdpConfig {
  // From the org's career center URL: workforcenow.adp.com/.../recruitment.html?...&client=<client>&cid=<cid>&...
  client: string;
  cid: string;
  organizationName: string;
}

export const adpAdapter: Adapter = {
  sourceName: "adp",
  sourceType: "adp",
  async fetchPostings(config: AdpConfig): Promise<NormalizedPosting[]> {
    const { client, cid, organizationName } = config;
    const url = `https://workforcenow.adp.com/mascsr/default/careercenter/public/events/staffing/v1/job-requisitions?cid=${cid}&lang=en_US`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ADP fetch failed for ${client}: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { jobRequisitions: AdpJobRequisition[] };

    return data.jobRequisitions.map((job) => ({
      externalId: job.itemID,
      title: job.requisitionTitle,
      organization: organizationName,
      location: job.requisitionLocations?.[0]?.nameCode?.shortName?.trim(),
      category: categorize(job.requisitionTitle, organizationName),
      url: `https://workforcenow.adp.com/mascsr/default/mdf/recruitment/recruitment.html?cid=${cid}&ccId=${job.itemID}&lang=en_US&selectedMenuKey=CareerCenter&client=${client}`,
      postedAt: job.postDate ? new Date(job.postDate) : undefined,
    }));
  },
};
