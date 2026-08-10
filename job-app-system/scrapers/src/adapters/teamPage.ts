import { chromium } from "playwright";
import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// Generic Playwright adapter for team career pages that aren't on Greenhouse/Lever/Workday.
// Config is CSS-selector driven so new teams can be added without touching this file —
// but selectors are site-specific and WILL drift; validate each new config against the
// live page before enabling it in sources.config.ts. Do not point this at a site that
// requires solving a bot challenge (Cloudflare Turnstile, hCaptcha, etc.) to load results.
interface TeamPageConfig {
  organizationName: string;
  listUrl: string;
  cardSelector: string; // one element per job posting
  titleSelector: string; // relative to card
  linkSelector: string; // relative to card, must resolve to an <a href>
  locationSelector?: string; // relative to card
}

export const teamPageAdapter: Adapter = {
  sourceName: "team_page",
  sourceType: "team_page",
  async fetchPostings(config: TeamPageConfig): Promise<NormalizedPosting[]> {
    const { organizationName, listUrl, cardSelector, titleSelector, linkSelector, locationSelector } = config;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(cardSelector, { timeout: 15000 });

      const cards = await page.$$(cardSelector);
      const postings: NormalizedPosting[] = [];

      for (const card of cards) {
        const title = (await card.$eval(titleSelector, (el) => el.textContent?.trim() ?? "")) || "";
        const href = await card.$eval(linkSelector, (el) => (el as HTMLAnchorElement).href);
        const location = locationSelector
          ? (await card.$eval(locationSelector, (el) => el.textContent?.trim() ?? "").catch(() => undefined))
          : undefined;

        if (!title || !href) continue;

        postings.push({
          externalId: href,
          title,
          organization: organizationName,
          location,
          category: categorize(title, organizationName),
          url: href,
        });
      }

      return postings;
    } finally {
      await browser.close();
    }
  },
};
