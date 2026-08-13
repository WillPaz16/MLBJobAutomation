import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Generic fallback for labels that aren't a fixed enum with a curated map (e.g. Analytics'
// by-stage/by-source breakdowns, and the Select-trigger label resolver in components/ui/select.tsx)
// — "team_page" -> "Team Page", "REVIEWING" -> "Reviewing". Prefer an explicit map wherever one
// exists; this is for the cases that don't have one. Lives here (not lib/labels.ts) because
// components/ui/* already imports from lib/utils and shouldn't reach into app-domain labels.
export function prettifyLabel(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

// Postings' description text comes from external ATS APIs as raw HTML (Greenhouse, BambooHR,
// Workday, Dayforce, TeamWork Online all store it that way) — rendering it as plain text left
// literal tags and entities (&amp;, &nbsp;) visible. DOMParser here is safe against XSS: the
// parsed document is never attached to the live DOM and script tags inside it never execute —
// only .textContent is read out of it, which strips all markup and decodes entities correctly.
//
// Greenhouse's own `?content=true` API is double-encoded: the `content` field's value is itself
// HTML-entity-escaped (its literal characters are "&lt;p&gt;...", not "<p>...") — confirmed live
// against the real API. A single decode pass only unwraps those entities, leaving the
// now-literal "<p>" tag characters visible as plain text. `stripOnce` is idempotent on real
// (non-double-encoded) HTML — once tags are gone there's nothing left for a second pass to do —
// so unconditionally running it twice fixes Greenhouse's case without needing to special-case it.
function stripOnce(html: string): string {
  const withLineBreaks = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "") // drop entirely — never meant to be visible text
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ");
  const text = new DOMParser().parseFromString(withLineBreaks, "text/html").body.textContent ?? "";
  const collapsedSpaces = text.replace(/[^\S\n]{2,}/g, " ");
  const trimmedLines = collapsedSpaces.replace(/[^\S\n]*\n[^\S\n]*/g, "\n");
  return trimmedLines.replace(/\n{3,}/g, "\n\n").trim();
}

export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return stripOnce(stripOnce(html));
}

// Short plain-text excerpt for card-list scanning (Discovery) — truncates at a word boundary
// rather than mid-word where reasonably easy, appending an ellipsis only when actually truncated.
// No date library is installed — this only needs whole-day granularity, so a small local helper
// is simpler than adding a dependency. Shared by Pipeline (posting posted/found dates) and Prep
// (application age) rather than each keeping its own copy.
export function relativeTime(isoDate: string): string {
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function snippet(html: string, maxChars = 200): string {
  const text = htmlToPlainText(html).replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}
