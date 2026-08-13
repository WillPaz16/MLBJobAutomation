import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// SIG's careers.sig.com runs a job-search widget in front of iCIMS (each job's `ats_code` is
// "icims") — but the widget's own JSON search API is a real, curl-verified public data source in
// its own right (confirmed live 2026-08-13), so we hit that directly rather than trying to scrape
// the iCIMS apply page it links out to. Description is already full HTML in the list response —
// no per-posting detail fetch needed, unlike workday.ts/bamboohr.ts.
interface SigJob {
  slug: string;
  title: string;
  description?: string;
  city?: string;
  state?: string;
  country?: string;
  hiring_organization?: string;
  apply_url: string;
  posted_date?: string;
}

interface SigApiResponse {
  jobs: { data: SigJob }[];
  totalCount: number;
}

interface SigCareersConfig {
  organizationName: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchPage(page: number): Promise<SigApiResponse> {
  const res = await fetch(
    `https://careers.sig.com/api/jobs?page=${page}&sortBy=relevance&descending=false&internal=false`,
    { headers: { "User-Agent": UA } }
  );
  if (!res.ok) {
    throw new Error(`SIG careers fetch failed on page ${page}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SigApiResponse;
}

export const sigCareersAdapter: Adapter = {
  sourceName: "sig-careers",
  sourceType: "sig-careers",
  async fetchPostings(config: SigCareersConfig): Promise<NormalizedPosting[]> {
    const { organizationName } = config;
    const postings: NormalizedPosting[] = [];
    let page = 1;
    let totalCount = Infinity;

    while (postings.length < totalCount) {
      const data = await fetchPage(page);
      totalCount = data.totalCount;
      if (data.jobs.length === 0) break;

      for (const { data: job } of data.jobs) {
        const location = [job.city, job.state].filter(Boolean).join(", ");
        postings.push({
          externalId: job.slug,
          title: job.title,
          organization: organizationName,
          location: location || undefined,
          category: categorize(job.title, organizationName, job.description),
          url: job.apply_url,
          description: job.description,
          postedAt: job.posted_date ? new Date(job.posted_date) : undefined,
        });
      }

      page += 1;
    }

    return postings;
  },
};
