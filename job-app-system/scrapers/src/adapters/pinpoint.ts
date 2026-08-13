import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// Pinpoint ATS — a genuinely new platform (not just a new org), confirmed live 2026-08-13 against
// Wolverine Trading's board: <subdomain>.pinpointhq.com/postings.json returns a bare
// `{ data: PinpointJob[] }` with no pagination metadata/headers observed (the whole board — 14
// jobs for Wolverine — comes back in one response; a `?page=2` query param is silently ignored).
// Full description text is already in the list response (`description`, plus a few other
// HTML-bearing sections like `key_responsibilities`/`skills_knowledge_expertise` we fold in for a
// fuller categorize() signal) — no per-posting detail fetch needed, same as SIG/greenhouse.
interface PinpointJob {
  id: string;
  title: string;
  description?: string;
  key_responsibilities?: string;
  skills_knowledge_expertise?: string;
  url: string;
  location?: { name?: string; city?: string };
}

interface PinpointApiResponse {
  data: PinpointJob[];
}

interface PinpointConfig {
  // From the org's careers URL / the `data-pinpoint-subdomain` attribute on their site:
  // <subdomain>.pinpointhq.com.
  subdomain: string;
  organizationName: string;
}

export const pinpointAdapter: Adapter = {
  sourceName: "pinpoint",
  sourceType: "pinpoint",
  async fetchPostings(config: PinpointConfig): Promise<NormalizedPosting[]> {
    const { subdomain, organizationName } = config;
    const res = await fetch(`https://${subdomain}.pinpointhq.com/postings.json`);
    if (!res.ok) {
      throw new Error(`Pinpoint fetch failed for ${subdomain}: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as PinpointApiResponse;

    return data.data.map((job) => {
      const description = [job.description, job.key_responsibilities, job.skills_knowledge_expertise]
        .filter(Boolean)
        .join("\n");
      return {
        externalId: job.id,
        title: job.title,
        organization: organizationName,
        location: job.location?.name ?? job.location?.city,
        category: categorize(job.title, organizationName, description || undefined),
        url: job.url,
        description: description || undefined,
      };
    });
  },
};
