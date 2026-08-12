import { createHash } from "crypto";
import type { Adapter, NormalizedPosting } from "../types.js";

// SimplifyJobs/New-Grad-Positions is a single community-maintained README covering 50+ companies
// across several category sections. Structurally different from every other adapter here: one
// fetch yields postings for MANY organizations at once, rather than one config entry = one org.
// runDiscovery.ts groups this adapter's output by `organization` before calling ingestPostings,
// since ingestPostings requires a single organization per call for its closing-pass scoping.
const README_URL = "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/README.md";

// Section header text -> hardcoded category. The README's own section is a more reliable signal
// than title-keyword categorize() heuristics for these three sections specifically.
// - Data Science, AI & Machine Learning -> DATA_SCIENCE (obvious fit).
// - Quantitative Finance -> DATA_SCIENCE (real statistics/modeling overlap with Will's background).
// - Product Management -> OTHER (a PM role isn't a data science role even at a data-driven company).
const SECTION_CATEGORY: Record<string, NormalizedPosting["category"]> = {
  "Data Science, AI & Machine Learning": "DATA_SCIENCE",
  "Quantitative Finance": "DATA_SCIENCE",
  "Product Management": "OTHER",
};

interface NewGradListConfig {
  // Section names to pull, matched against header text after stripping the leading emoji and
  // trailing "New Grad Roles" suffix — e.g. "Data Science, AI & Machine Learning".
  sections: string[];
}

// Matches a `## <emoji> <Section Name> New Grad Roles` markdown header line.
const SECTION_HEADER_RE = /^##\s+\S+\s+(.+?)\s+New Grad Roles\s*$/;

// Strips a leading legend emoji (and any following whitespace) from company anchor text, e.g.
// "🔥 Apple" -> "Apple". Legend emoji per the README's own Legend section: 🛂 🇺🇸 🔒 🔥 🎓.
function stripLeadingEmoji(text: string): string {
  return text.replace(/^[\p{Extended_Pictographic}️\s]+/u, "").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "").trim());
}

// Splits the README into { sectionName -> tableHtml } for every section header found.
function extractSections(markdown: string): Map<string, string> {
  const lines = markdown.split("\n");
  const sections = new Map<string, string>();
  let currentSection: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentSection) {
      sections.set(currentSection, buffer.join("\n"));
    }
    buffer = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(SECTION_HEADER_RE);
    if (headerMatch) {
      flush();
      currentSection = headerMatch[1].trim();
      continue;
    }
    if (currentSection) buffer.push(line);
  }
  flush();

  return sections;
}

function extractRows(tableHtml: string): string[] {
  const tableMatch = tableHtml.match(/<table[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return [];
  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  const body = tbodyMatch ? tbodyMatch[1] : tableMatch[1];
  const rows: string[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(body))) {
    rows.push(m[1]);
  }
  return rows;
}

function extractCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRe.exec(rowHtml))) {
    cells.push(m[1]);
  }
  return cells;
}

interface ParsedRow {
  organization: string;
  title: string;
  location: string;
  url: string;
}

function parseRow(rowHtml: string): ParsedRow | null {
  const cells = extractCells(rowHtml);
  if (cells.length < 4) return null;

  const [companyCell, roleCell, locationCell, applicationCell] = cells;

  const companyAnchorMatch = companyCell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
  const companyText = companyAnchorMatch ? stripTags(companyAnchorMatch[1]) : stripTags(companyCell);
  const organization = stripLeadingEmoji(companyText);

  const title = stripTags(roleCell);
  const location = stripTags(locationCell);

  // The Application cell has (up to) two anchors: the first wraps the "Apply" image and is the
  // real posting URL; the second wraps the "Simplify" image and is just Simplify's own tracking
  // page (simplify.jobs/p/...). Take the first href, not the second, and not the company-profile
  // link in column 1 (simplify.jobs/c/...).
  const hrefRe = /<a[^>]*href="([^"]+)"/g;
  const applyMatch = hrefRe.exec(applicationCell);
  const url = applyMatch ? decodeEntities(applyMatch[1]) : "";

  if (!organization || !title || !url) return null;

  return { organization, title, location, url };
}

export const newGradListAdapter: Adapter = {
  sourceName: "simplify-new-grad",
  sourceType: "new-grad-list",
  async fetchPostings(config: NewGradListConfig): Promise<NormalizedPosting[]> {
    const { sections } = config;
    const res = await fetch(README_URL);
    if (!res.ok) {
      throw new Error(`New-Grad-Positions README fetch failed: ${res.status} ${res.statusText}`);
    }
    const markdown = await res.text();
    const sectionMap = extractSections(markdown);

    const postings: NormalizedPosting[] = [];
    for (const sectionName of sections) {
      const tableHtml = sectionMap.get(sectionName);
      if (!tableHtml) continue;
      const category = SECTION_CATEGORY[sectionName] ?? "OTHER";

      let lastOrganization: string | undefined;
      for (const rowHtml of extractRows(tableHtml)) {
        const parsed = parseRow(rowHtml);
        if (!parsed) continue;

        // The repo's own convention: a company cell of "↳" means "same organization as the
        // immediately preceding row" (used when one company posts multiple new-grad roles in a
        // row) — carry the previous row's organization forward rather than treating "↳" as a
        // literal org name.
        if (parsed.organization === "↳") {
          if (!lastOrganization) continue;
          parsed.organization = lastOrganization;
        } else {
          lastOrganization = parsed.organization;
        }

        postings.push({
          externalId: createHash("sha256").update(parsed.url).digest("hex"),
          title: parsed.title,
          organization: parsed.organization,
          location: parsed.location || undefined,
          category,
          url: parsed.url,
          description: undefined,
        });
      }
    }

    return postings;
  },
};
