import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// optiver.com/en/api/v1/jobs — plain public JSON API, curl-verified live 2026-08-13 (184 live
// jobs at the time). No description in the list response, and no JobPosting-schema description
// field in the detail page's own application/ld+json block either (confirmed live) — the real
// description text is plain server-rendered HTML inside a "Components.RichText" block on the
// detail page, bracketed by matching HTML comments (`<!-- React Component - Components.RichText
// - Start/End -->`), confirmed to appear exactly once per detail page. Plain fetch is enough,
// same as DRW/SIG — no Playwright needed for either the list or detail page.
interface OptiverJob {
  title: string;
  location?: string;
  href: string;
}

interface OptiverApiResponse {
  items: OptiverJob[];
  totalCount: number;
}

interface OptiverConfig {
  organizationName: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PAGE_SIZE = 16;

const RICH_TEXT_RE =
  /<!--\s*React Component - Components\.RichText - Start\s*-->(.*?)<!--\s*React Component - Components\.RichText - End\s*-->/s;

async function fetchPage(from: number): Promise<OptiverApiResponse> {
  const res = await fetch(`https://www.optiver.com/en/api/v1/jobs?from=${from}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`Optiver fetch failed at from=${from}: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OptiverApiResponse;
}

async function fetchJobDescription(href: string): Promise<string | undefined> {
  const res = await fetch(`https://www.optiver.com${href}`, { headers: { "User-Agent": UA } });
  if (!res.ok) return undefined;
  const html = await res.text();
  return RICH_TEXT_RE.exec(html)?.[1]?.trim();
}

export const optiverAdapter: Adapter = {
  sourceName: "optiver",
  sourceType: "optiver",
  async fetchPostings(config: OptiverConfig): Promise<NormalizedPosting[]> {
    const { organizationName } = config;
    const postings: NormalizedPosting[] = [];
    let from = 0;
    let totalCount = Infinity;

    while (from < totalCount) {
      const data = await fetchPage(from);
      totalCount = data.totalCount;
      if (data.items.length === 0) break;

      for (const job of data.items) {
        const description = await fetchJobDescription(job.href).catch(() => undefined);
        postings.push({
          // href is stable per posting and unique — no separate id field in the list response.
          externalId: job.href,
          title: job.title,
          organization: organizationName,
          location: job.location,
          category: categorize(job.title, organizationName, description),
          url: `https://www.optiver.com${job.href}`,
          description,
        });
      }

      from += PAGE_SIZE;
    }

    return postings;
  },
};
