import { chromium, type Frame, type Page } from "playwright";
import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// Generic Playwright adapter for team career pages that aren't on Greenhouse/Lever/Workday/ADP/
// UKG/BambooHR. Config is CSS-selector driven so new teams can be added without touching this
// file — but selectors are site-specific and WILL drift; validate each new config against the
// live page before enabling it in sources.config.ts. Do not point this at a site that requires
// solving a bot challenge (Cloudflare Turnstile, hCaptcha, etc.) to load results.
interface TeamPageConfig {
  organizationName: string;
  listUrl: string;
  cardSelector: string; // one element per job posting
  titleSelector: string; // relative to card
  linkSelector: string; // relative to card, must resolve to an <a href>
  locationSelector?: string; // relative to card
  // Some ATS platforms (e.g. iCIMS) render the actual listing inside a same-origin iframe that
  // won't load correctly if navigated to directly — it depends on being embedded in the parent
  // page. Set this to a substring of the iframe's URL to have the adapter search page.frames()
  // for it instead of querying the top-level document.
  frameUrlContains?: string;
}

async function findFrame(page: Page, frameUrlContains: string, timeoutMs = 15000): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url().includes(frameUrlContains));
    if (frame) return frame;
    await page.waitForTimeout(500);
  }
  throw new Error(`No frame found containing "${frameUrlContains}" after ${timeoutMs}ms`);
}

export const teamPageAdapter: Adapter = {
  sourceName: "team_page",
  sourceType: "team_page",
  async fetchPostings(config: TeamPageConfig): Promise<NormalizedPosting[]> {
    const { organizationName, listUrl, cardSelector, titleSelector, linkSelector, locationSelector, frameUrlContains } =
      config;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(listUrl, { waitUntil: "networkidle", timeout: 30000 });

      const target: Page | Frame = frameUrlContains ? await findFrame(page, frameUrlContains) : page;
      // A legitimately empty listing (zero current postings) means cardSelector never appears —
      // that's not a failure, so don't let the timeout here bubble up as an error.
      await target.waitForSelector(cardSelector, { timeout: 15000 }).catch(() => {});

      const cards = await target.$$(cardSelector);
      const postings: NormalizedPosting[] = [];

      for (const card of cards) {
        const title = (await card.$eval(titleSelector, (el) => el.textContent?.trim() ?? "")) || "";
        const href = await card
          .$eval(linkSelector, (el) => (el as HTMLAnchorElement).href)
          .catch(() => undefined);
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
