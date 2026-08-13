import type { Adapter, NormalizedPosting } from "../types.js";
import { categorize } from "../categorize.js";

// TeamWork Online team career pages (e.g. teamworkonline.com/baseball-jobs/<org>/<org>) render
// fully server-side with a real browser User-Agent — no Cloudflare challenge, no JS execution
// needed. This reverses the earlier assumption (still true for TeamWork Online's own generic job
// search) that the platform blocks scripted requests; team-specific career pages are plain HTML.
// Each detail page embeds a schema.org JobPosting as JSON-LD, which is what we parse here instead
// of scraping visible DOM text (more stable across markup changes).
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

interface TeamworkOnlineConfig {
  orgPath: string; // e.g. "miamibaseball/miami-marlins"
  organizationName: string;
}

function extractDetailLinks(listingHtml: string, orgPath: string): string[] {
  const pattern = new RegExp(`href="(/baseball-jobs/${orgPath}/[a-z0-9-]+-\\d+)"`, "g");
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(listingHtml)) !== null) {
    links.add(match[1]);
  }
  return [...links];
}

// schema.org's baseSalary shape varies (MonetaryAmount vs MonetaryAmountDistribution, unit
// text vs structured min/max) — live-checked against several real Marlins/Reds postings and it
// was absent in every one sampled, so this is wired up opportunistically and stays dormant in
// practice rather than forced to always produce a string. Anything outside the shapes below
// returns undefined rather than guessing.
function extractSalary(jobPosting: Record<string, any>): string | undefined {
  const baseSalary = jobPosting.baseSalary;
  if (!baseSalary || typeof baseSalary !== "object") return undefined;
  const value = baseSalary.value;
  if (!value || typeof value !== "object") return undefined;

  const currency = baseSalary.currency ?? "";
  const unit = value.unitText ? `/${String(value.unitText).toLowerCase()}` : "";

  if (typeof value.value === "number") {
    return `${currency}${value.value}${unit}`.trim() || undefined;
  }
  if (typeof value.minValue === "number" && typeof value.maxValue === "number") {
    return `${currency}${value.minValue} - ${currency}${value.maxValue}${unit}`.trim();
  }
  return undefined;
}

function extractJobPosting(detailHtml: string): Record<string, any> | undefined {
  const match = detailHtml.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

export const teamworkOnlineAdapter: Adapter = {
  sourceName: "teamworkonline",
  sourceType: "teamworkonline",
  async fetchPostings(config: TeamworkOnlineConfig): Promise<NormalizedPosting[]> {
    const { orgPath, organizationName } = config;
    const listingRes = await fetch(`https://www.teamworkonline.com/baseball-jobs/${orgPath}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!listingRes.ok) {
      throw new Error(`TeamWork Online fetch failed: ${listingRes.status} ${listingRes.statusText}`);
    }
    const listingHtml = await listingRes.text();
    const detailPaths = extractDetailLinks(listingHtml, orgPath);

    const postings: NormalizedPosting[] = [];
    let parseFailures = 0;
    for (const path of detailPaths) {
      const url = `https://www.teamworkonline.com${path}`;
      const detailRes = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!detailRes.ok) {
        parseFailures++;
        continue;
      }
      const detailHtml = await detailRes.text();
      const jobPosting = extractJobPosting(detailHtml);
      if (!jobPosting || jobPosting["@type"] !== "JobPosting") {
        parseFailures++;
        continue;
      }

      const title = jobPosting.title as string | undefined;
      if (!title) {
        parseFailures++;
        continue;
      }

      const place = jobPosting.jobLocation?.[0]?.address;
      const location = place ? [place.addressLocality, place.addressRegion].filter(Boolean).join(", ") : undefined;
      const externalId = String(jobPosting.identifier?.value ?? path);
      const description = jobPosting.description as string | undefined;

      postings.push({
        externalId,
        title,
        organization: organizationName,
        location,
        category: categorize(title, organizationName, description),
        url,
        description,
        salary: extractSalary(jobPosting),
        postedAt: jobPosting.datePosted ? new Date(jobPosting.datePosted) : undefined,
      });
    }

    // One malformed posting shouldn't abort a whole org (the per-posting catch/continue above
    // already handles that) — but total parse failure across a non-empty listing means the
    // listing HTML or the JSON-LD shape has rotted, not that the org genuinely has zero postings.
    if (detailPaths.length > 0 && parseFailures === detailPaths.length) {
      throw new Error(
        `TeamWork Online: found ${detailPaths.length} listing link(s) for ${organizationName} but ` +
          `every detail page failed to parse — listing HTML or JSON-LD shape likely changed`
      );
    }

    return postings;
  },
};
