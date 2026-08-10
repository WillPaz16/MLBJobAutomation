import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

interface AaimtrackJob {
  id: number;
  title: string;
  city?: string;
  stateName?: string;
  jobUrl: string;
}

interface AaimtrackConfig {
  // From the org's careers URL: <subdomain>.aaimtrack.com/jobs/ — domainId is visible in the
  // page's own XHR calls to /core/jobs/<domainId> (view network tab, no public docs for this).
  subdomain: string;
  domainId: string;
  organizationName: string;
}

const GET_PARAMS = encodeURIComponent(
  JSON.stringify({
    cityUrl: "",
    countryAbbreviation: "",
    stateAbbreviation: "",
    isInternal: 0,
    showLocation: 1,
  })
);

export const aaimtrackAdapter: Adapter = {
  sourceName: "aaimtrack",
  sourceType: "aaimtrack",
  async fetchPostings(config: AaimtrackConfig): Promise<NormalizedPosting[]> {
    const { subdomain, domainId, organizationName } = config;
    const url = `https://${subdomain}.aaimtrack.com/core/jobs/${domainId}?getParams=${GET_PARAMS}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`aaimtrack fetch failed for ${subdomain}: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { data: { jobs: AaimtrackJob[] } };

    return (data.data.jobs ?? []).map((job) => {
      const location = [job.city, job.stateName].filter(Boolean).join(", ");
      return {
        externalId: String(job.id),
        title: job.title.trim(),
        organization: organizationName,
        location: location || undefined,
        category: categorize(job.title, organizationName),
        url: job.jobUrl,
      };
    });
  },
};
