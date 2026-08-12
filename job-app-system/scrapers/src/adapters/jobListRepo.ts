import { createHash } from "crypto";
import type { Adapter, NormalizedPosting } from "../types.js";

// Generalized adapter for community-maintained GitHub README job-list repos (SimplifyJobs/
// New-Grad-Positions, SimplifyJobs/Summer2026-Internships, speedyapply/2026-AI-College-Jobs,
// vanshb03/New-Grad-2026, ...). Each config entry is one repo/README. Structurally different from
// every other adapter here: one fetch yields postings spanning 50+ organizations, not one config
// entry = one org — runDiscovery.ts groups this adapter's output by `organization` before calling
// ingestPostings, since ingestPostings requires a single organization per call for its
// closing-pass scoping.

export type TableFormat = "html" | "pipe";

// Sentinel section name for repos with no section headers at all (e.g. vansh's flat table) — the
// entire markdown body is treated as one section keyed by this constant.
export const FLAT_SECTION = "__flat__";

export interface JobListRepoConfig {
  key: string; // stable id — becomes the Source name/sourceName
  readmeUrl: string; // full raw URL INCLUDING branch (dev vs main differs per repo)
  tableFormat: TableFormat;
  sectionHeaderRe: RegExp | null; // null = no section headers, treat whole doc as one flat section
  sections: string[]; // which parsed section names to actually ingest
  sectionLabel: Record<string, string>; // parsed section name -> stored sourceSection value
  sectionCategory: Record<string, NormalizedPosting["category"]>;
  columns: { company: number; title: number; location: number; apply: number; salary?: number };
  minCells: number;
  titleIncludeRe?: RegExp; // row-level gate on title — REQUIRED when sectionHeaderRe is null
  titleExcludeRe?: RegExp;
  minExpectedPostings: number; // sanity floor — see the three-guard failure-mode design below
}

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

// Strips markdown bold (`**Quora**` -> `Quora`), used only by the pipe-table path before the
// shared cell-processing logic runs.
function stripMarkdownBold(cell: string): string {
  return cell.replace(/^\*\*(.+)\*\*$/, "$1");
}

// Different tracking/UTM params get appended to the same underlying apply URL by different repos
// (Simplify: ?utm_source=Simplify&ref=Simplify; vansh: ?utm_source=vansh; speedyapply: none) — so
// the same real job would hash to different externalIds across repos without this. Strip them,
// plus the hash and a trailing slash, before hashing for externalId.
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k) || k === "ref" || k === "source" || k === "gh_src") u.searchParams.delete(k);
    }
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

// Splits the README into { sectionName -> body } for every section header found by `headerRe`.
// When `headerRe` is null, the entire markdown is treated as one section keyed FLAT_SECTION.
function extractSections(markdown: string, headerRe: RegExp | null): Map<string, string> {
  if (!headerRe) {
    return new Map([[FLAT_SECTION, markdown]]);
  }

  const lines = markdown.split("\n");
  const sections = new Map<string, string>();
  let currentSection: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentSection) sections.set(currentSection, buffer.join("\n"));
    buffer = [];
  };

  for (const line of lines) {
    const headerMatch = line.match(headerRe);
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

// --- HTML <table> row extraction (Simplify's format) ---

function extractHtmlRows(sectionBody: string): string[] {
  const rows: string[] = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let tableMatch;
  while ((tableMatch = tableRe.exec(sectionBody))) {
    const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    const body = tbodyMatch ? tbodyMatch[1] : tableMatch[1];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(body))) rows.push(m[1]);
  }
  return rows;
}

function extractHtmlCells(rowHtml: string): string[] {
  const cells: string[] = [];
  const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = cellRe.exec(rowHtml))) cells.push(m[1]);
  return cells;
}

// --- Pipe-delimited markdown table row extraction (vansh / speedyapply's format) ---

const SEPARATOR_ROW_RE = /^\|[\s\-:|]+\|$/;

function extractPipeRows(sectionBody: string, minCells: number): string[][] {
  const lines = sectionBody.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  const dataLines = lines.filter((l) => !SEPARATOR_ROW_RE.test(l));

  const rows: string[][] = [];
  for (const line of dataLines) {
    // `</br>` inside a cell (multi-location listings) must become "; " BEFORE tag-stripping, or
    // "Chicago, IL</br>New York, NY" concatenates into one word once tags are dropped.
    const normalized = line.replace(/<\/?br\s*\/?>/gi, "; ");
    const rawCells = normalized.split("|").map((c) => c.trim());
    // A well-formed pipe row is `| a | b | c |` — split on "|" yields leading/trailing empty
    // strings from before the first and after the last pipe; drop those, not any real cell.
    if (rawCells.length > 0 && rawCells[0] === "") rawCells.shift();
    if (rawCells.length > 0 && rawCells[rawCells.length - 1] === "") rawCells.pop();

    if (rawCells.length < minCells) continue; // malformed row — skip, don't crash
    // Header row detection: the literal column-name row (e.g. "Company | Role | ...") has no
    // usable link and would otherwise parse as garbage; the fixed marker below is enough since
    // every configured repo's header row starts with "Company".
    if (rawCells[0] === "Company") continue;

    rows.push(rawCells.map(stripMarkdownBold));
  }
  return rows;
}

// --- Shared cell-processing (applies identically regardless of which format produced the cells) ---

// Finds the real apply URL for a row. Every configured repo wraps its real apply link in an
// anchor around an "Apply" image (`alt="Apply"`) — searching for that signature across all cells
// (rather than trusting one fixed column index) is what makes this robust to speedyapply's
// section-to-section column-count drift (its "Other" table has no Salary column, its "Quant" one
// does) without needing a different config per section. Falls back to `columns.apply` for repos
// that lack the image signature. A row with no real href (the bare 🔒-closed case) returns null —
// callers must skip it, not treat it as an error.
function findApplyUrl(cells: string[], applyColumnIndex: number): string | null {
  for (const cell of cells) {
    if (/alt="Apply"/i.test(cell)) {
      const hrefMatch = cell.match(/<a[^>]*href="([^"]+)"/);
      if (hrefMatch) return decodeEntities(hrefMatch[1]);
    }
  }
  const fallbackCell = cells[applyColumnIndex];
  if (!fallbackCell) return null;
  const hrefMatch = fallbackCell.match(/<a[^>]*href="([^"]+)"/);
  return hrefMatch ? decodeEntities(hrefMatch[1]) : null;
}

interface ParsedRow {
  organization: string;
  title: string;
  location: string;
  url: string;
}

function parseRow(cells: string[], columns: JobListRepoConfig["columns"]): ParsedRow | null {
  const companyCell = cells[columns.company];
  const titleCell = cells[columns.title];
  const locationCell = cells[columns.location];
  if (companyCell === undefined || titleCell === undefined || locationCell === undefined) return null;

  const companyAnchorMatch = companyCell.match(/<a[^>]*>([\s\S]*?)<\/a>/);
  const companyText = companyAnchorMatch ? stripTags(companyAnchorMatch[1]) : stripTags(companyCell);
  const organization = stripLeadingEmoji(companyText);

  const title = stripTags(titleCell);
  const location = stripTags(locationCell);

  const url = findApplyUrl(cells, columns.apply);
  if (!url) return null; // bare 🔒-closed row, or a genuinely malformed one — skip, don't error

  if (!organization || !title) return null;

  return { organization, title, location, url };
}

export const jobListRepoAdapter: Adapter = {
  sourceName: "job-list-repo", // per-config sourceName is actually cfg.key, resolved by the runner
  sourceType: "job-list-repo",
  async fetchPostings(config: Record<string, any>): Promise<NormalizedPosting[]> {
    const cfg = config as JobListRepoConfig;

    // A flat repo (no section headers) with no title filter would dump everything into one
    // bucket — exactly the flooding problem a prior session already had to fix once by REMOVING
    // sources. Enforce at fetch time, not just by convention.
    if (cfg.sectionHeaderRe === null && !cfg.titleIncludeRe) {
      throw new Error(
        `[${cfg.key}] sectionHeaderRe is null (no section headers) but titleIncludeRe is unset — ` +
          `a flat repo requires a title filter to avoid flooding one bucket.`
      );
    }

    const res = await fetch(cfg.readmeUrl);
    if (!res.ok) {
      throw new Error(`[${cfg.key}] README fetch failed: ${res.status} ${res.statusText}`);
    }
    const markdown = await res.text();
    const sectionMap = extractSections(markdown, cfg.sectionHeaderRe);

    const postings: NormalizedPosting[] = [];
    for (const sectionName of cfg.sections) {
      const sectionBody = sectionMap.get(sectionName);
      // Guard layer 1: a configured section not found in the parsed README means the parser or
      // upstream format changed — throw, don't silently skip, since a silent 0 combined with the
      // 2-missed-runs closing pass in ingest.ts is a mass-close event, not a no-op.
      if (sectionBody === undefined) {
        throw new Error(`[${cfg.key}] section "${sectionName}" not found in README — parser or upstream format changed`);
      }

      const category = cfg.sectionCategory[sectionName] ?? "OTHER";
      const sourceSection = cfg.sectionLabel[sectionName] ?? sectionName;

      const rows: string[][] =
        cfg.tableFormat === "html"
          ? extractHtmlRows(sectionBody).map(extractHtmlCells)
          : extractPipeRows(sectionBody, cfg.minCells);

      let lastOrganization: string | undefined;
      for (const cells of rows) {
        if (cells.length < cfg.minCells) continue;

        const parsed = parseRow(cells, cfg.columns);
        if (!parsed) continue;

        // "↳" in a company cell means "same org as the row above" (Simplify convention; harmless
        // no-op for repos that don't use it).
        if (parsed.organization === "↳") {
          if (!lastOrganization) continue;
          parsed.organization = lastOrganization;
        } else {
          lastOrganization = parsed.organization;
        }

        if (cfg.titleIncludeRe && !cfg.titleIncludeRe.test(parsed.title)) continue;
        if (cfg.titleExcludeRe && cfg.titleExcludeRe.test(parsed.title)) continue;

        postings.push({
          externalId: createHash("sha256").update(canonicalUrl(parsed.url)).digest("hex"),
          title: parsed.title,
          organization: parsed.organization,
          location: parsed.location || undefined,
          category,
          url: parsed.url,
          description: undefined,
          sourceSection,
        });
      }
    }

    // Guard layer 2: total rows across all configured sections below the verified-live floor
    // means something drifted upstream even though sections themselves were found (e.g. a column
    // was added and every row now parses to fewer usable postings).
    if (postings.length < cfg.minExpectedPostings) {
      throw new Error(
        `[${cfg.key}] parsed ${postings.length} posting(s), below minExpectedPostings=${cfg.minExpectedPostings} — ` +
          `possible parser/format drift`
      );
    }

    return postings;
  },
};
