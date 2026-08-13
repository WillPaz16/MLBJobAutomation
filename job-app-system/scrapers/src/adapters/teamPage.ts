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
  // Optional: a selector on the detail page (the href from linkSelector) whose text content is
  // the full job description. Requires an extra page navigation per posting, so only set this
  // once verified live against the real detail page — don't guess at a shape. Omit entirely for
  // sites where the detail page isn't reachable/verifiable (e.g. nested cross-origin iframes).
  descriptionSelector?: string;
  // Optional marker selector confirming a genuinely empty listing (e.g. a "no open jobs right
  // now" message). A cardSelector timeout is genuinely ambiguous on its own — it could mean a
  // real empty board, OR a rotted selector / a page that never rendered. When set, a timeout is
  // only trusted as a real empty board if this selector is ALSO present; if it's set but absent,
  // or if it's not configured at all, the timeout is treated conservatively as adapter/selector
  // rot and throws instead of silently returning []. Only set this after confirming the real
  // empty-state marker live against the actual page — don't guess at a shape.
  emptyStateSelector?: string;
}

async function fetchDescription(browser: import("playwright").Browser, url: string, selector: string): Promise<string | undefined> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    return await page.$eval(selector, (el) => el.textContent?.trim() || undefined).catch(() => undefined);
  } finally {
    await page.close();
  }
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
    const {
      organizationName,
      listUrl,
      cardSelector,
      titleSelector,
      linkSelector,
      locationSelector,
      frameUrlContains,
      descriptionSelector,
      emptyStateSelector,
    } = config;
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(listUrl, { waitUntil: "networkidle", timeout: 30000 });

      const target: Page | Frame = frameUrlContains ? await findFrame(page, frameUrlContains) : page;
      // cardSelector never appearing is genuinely ambiguous: it could mean a real empty listing
      // (zero current postings) or a rotted selector / a page that never rendered. Only trust it
      // as a real empty board when emptyStateSelector is configured AND actually present on the
      // page — otherwise treat it conservatively as adapter breakage and throw, backstopped
      // either way by runDiscovery's dynamic-floor guard.
      const cardsAppeared = await target
        .waitForSelector(cardSelector, { timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (!cardsAppeared) {
        const emptyStateFound = emptyStateSelector
          ? await target
              .waitForSelector(emptyStateSelector, { timeout: 2000 })
              .then(() => true)
              .catch(() => false)
          : false;
        if (!emptyStateFound) {
          throw new Error(
            `teamPageAdapter: "${cardSelector}" never appeared on ${listUrl}${
              emptyStateSelector ? ` and emptyStateSelector "${emptyStateSelector}" was not found either` : " (no emptyStateSelector configured)"
            } — treating as selector rot / a page that failed to render, not a genuine empty board`
          );
        }
      }

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

        const description = descriptionSelector
          ? await fetchDescription(browser, href, descriptionSelector)
          : undefined;

        postings.push({
          externalId: href,
          title,
          organization: organizationName,
          location,
          category: categorize(title, organizationName, description),
          url: href,
          description,
        });
      }

      return postings;
    } finally {
      await browser.close();
    }
  },
};
