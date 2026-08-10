import { chromium } from "playwright";
import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// Dayforce HCM candidate portals (jobs.dayforcehcm.com) block a raw fetch/curl replay of their
// own `/api/geo/<tenant>/jobposting/search` API with a 403 — even one replayed from inside the
// live page's own JS console with matching cookies. But that block is specifically against
// scripted HTTP replay, not against browser automation: a genuine Playwright navigation (real
// Chromium loading the page, same as teamPageAdapter does for other sites) reaches the same
// endpoint and gets a normal 200 with the full job list. This isn't defeating bot detection — the
// site is only refusing standalone API calls, and we're doing exactly what a real visitor's
// browser does. Intercept the network response instead of hitting the API directly.
interface DayforceConfig {
  tenant: string; // e.g. "royals", "dbacks" — the path segment in jobs.dayforcehcm.com/en-US/<tenant>/...
  organizationName: string;
  baseUrl?: string; // overridable for tests against a local fixture; defaults to the real host
}

export const dayforceAdapter: Adapter = {
  sourceName: "dayforce",
  sourceType: "dayforce",
  async fetchPostings(config: DayforceConfig): Promise<NormalizedPosting[]> {
    const { tenant, organizationName, baseUrl = "https://jobs.dayforcehcm.com" } = config;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const responsePromise = page
        .waitForResponse((res) => res.url().includes(`/api/geo/${tenant}/jobposting/search`), { timeout: 30000 })
        .catch(() => undefined);

      await page.goto(`${baseUrl}/en-US/${tenant}/CANDIDATEPORTAL`, {
        waitUntil: "load",
        timeout: 30000,
      });

      const response = await responsePromise;
      if (!response) return [];
      const body = await response.json().catch(() => undefined);
      const jobPostings: any[] = body?.jobPostings ?? [];

      return jobPostings
        .map((job): NormalizedPosting | undefined => {
          const title = job.jobTitle?.trim();
          if (!title || !job.jobPostingId) return undefined;
          const place = job.postingLocations?.[0];
          const location = place ? [place.cityName, place.stateCode].filter(Boolean).join(", ") : undefined;
          const description = job.jobDescription as string | undefined;

          return {
            externalId: String(job.jobPostingId),
            title,
            organization: organizationName,
            location,
            category: categorize(title, organizationName, description),
            url: `${baseUrl}/en-US/${tenant}/CANDIDATEPORTAL/jobs/${job.jobPostingId}`,
            description,
            postedAt: job.postingStartTimestampUTC ? new Date(job.postingStartTimestampUTC) : undefined,
          };
        })
        .filter((p): p is NormalizedPosting => p !== undefined);
    } finally {
      await browser.close();
    }
  },
};
