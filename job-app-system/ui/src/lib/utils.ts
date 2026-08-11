import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Postings' description text comes from external ATS APIs as raw HTML (Greenhouse, BambooHR,
// Workday, Dayforce, TeamWork Online all store it that way) — rendering it as plain text left
// literal tags and entities (&amp;, &nbsp;) visible. DOMParser here is safe against XSS: the
// parsed document is never attached to the live DOM and script tags inside it never execute —
// only .textContent is read out of it, which strips all markup and decodes entities correctly.
export function htmlToPlainText(html: string): string {
  if (!html) return "";
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
