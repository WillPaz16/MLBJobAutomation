import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Wand2,
} from "lucide-react";
import { api, ApiError } from "../api/client";
import type { ApplyPack } from "../api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// Fields whose value renders masked (••••••••) by default, with a per-field reveal toggle —
// DOB/address/EEO fields are exactly the ones a screenshare or over-the-shoulder glance shouldn't
// leak the moment the panel is opened. Contact fields (email/phone/name) are NOT masked — those
// are routinely visible on a resume already.
const SENSITIVE_KEYS = new Set([
  "dateOfBirth",
  "addressStreet",
  "addressCity",
  "addressState",
  "addressZip",
  "addressCountry",
  "genderIdentityLabel",
  "raceEthnicityLabel",
  "disabilityStatusLabel",
  "veteranStatusLabel",
]);

function CopyButton({ text, label }: { text: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label}`);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }
  return (
    <Button size="icon-xs" variant="ghost" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      <Copy className="size-3.5" />
    </Button>
  );
}

function IdentityRow({ label, value, sensitive }: { label: string; value: string | null | undefined; sensitive: boolean }) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;
  const showMasked = sensitive && !revealed;
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono">{showMasked ? "••••••••" : value}</span>
        {sensitive && (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? `Hide ${label}` : `Reveal ${label}`}
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        )}
        <CopyButton text={value} label={label} />
      </div>
    </div>
  );
}

// Apply-assist panel: reuses PrepContextPanel's collapsible-shell pattern (collapsed by default,
// only fetches on first expand) but renders actual PII, so it never auto-expands and masks the
// most sensitive fields (DOB/address/EEO) behind a per-field reveal toggle even once open — a
// screenshare or over-the-shoulder glance shouldn't leak them just because the panel is open.
// Read-only/copy/download only, per CLAUDE.md's no-autonomous-submission rule — nothing here
// submits anything anywhere.
export function ApplyPanel({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = useState(false);
  const [pack, setPack] = useState<ApplyPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || pack) return;
    setLoading(true);
    setError(null);
    api.applications
      .applyPack(applicationId)
      .then(setPack)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load apply pack"))
      .finally(() => setLoading(false));
  }, [open, applicationId, pack]);

  async function copyAllAsJson() {
    if (!pack) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(pack, null, 2));
      toast.success("Copied full apply pack as JSON");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  const identity = pack?.identity;
  const posting = pack?.application?.posting;
  const resumeDocId = pack?.application?.resumeDocId;
  const coverDocId = pack?.application?.coverDocId;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Apply assist
        <span className="text-xs font-normal text-muted-foreground">
          (identity, documents, answers — contains personal data)
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t px-3 py-3 text-sm">
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : error ? (
            <div className="text-xs text-destructive">{error}</div>
          ) : pack ? (
            <>
              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Posting</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="font-medium">
                    {posting?.title} — {posting?.organization}
                  </span>
                  {posting?.url && (
                    <a
                      href={posting.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-primary"
                      aria-label="Open original posting"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Identity</div>
                {identity ? (
                  <div className="mt-1 space-y-1">
                    <IdentityRow label="Legal first name" value={identity.legalFirstName} sensitive={false} />
                    <IdentityRow label="Legal middle name" value={identity.legalMiddleName} sensitive={false} />
                    <IdentityRow label="Legal last name" value={identity.legalLastName} sensitive={false} />
                    <IdentityRow label="Preferred name" value={identity.preferredName} sensitive={false} />
                    <IdentityRow label="Email" value={identity.email} sensitive={false} />
                    <IdentityRow label="Phone" value={identity.phone} sensitive={false} />
                    <IdentityRow label="Date of birth" value={identity.dateOfBirth} sensitive={SENSITIVE_KEYS.has("dateOfBirth")} />
                    <IdentityRow
                      label="Street"
                      value={identity.addressStreet}
                      sensitive={SENSITIVE_KEYS.has("addressStreet")}
                    />
                    <IdentityRow label="City" value={identity.addressCity} sensitive={SENSITIVE_KEYS.has("addressCity")} />
                    <IdentityRow
                      label="State"
                      value={identity.addressState}
                      sensitive={SENSITIVE_KEYS.has("addressState")}
                    />
                    <IdentityRow label="Zip" value={identity.addressZip} sensitive={SENSITIVE_KEYS.has("addressZip")} />
                    <IdentityRow
                      label="Country"
                      value={identity.addressCountry}
                      sensitive={SENSITIVE_KEYS.has("addressCountry")}
                    />
                    <IdentityRow
                      label="Authorized to work (US)"
                      value={
                        identity.authorizedToWorkUs === null
                          ? "Declined"
                          : identity.authorizedToWorkUs
                            ? "Yes"
                            : "No"
                      }
                      sensitive={false}
                    />
                    <IdentityRow
                      label="Requires sponsorship"
                      value={
                        identity.requiresSponsorship === null
                          ? "Declined"
                          : identity.requiresSponsorship
                            ? "Yes"
                            : "No"
                      }
                      sensitive={false}
                    />
                    <IdentityRow
                      label="Gender"
                      value={identity.genderIdentityLabel}
                      sensitive={SENSITIVE_KEYS.has("genderIdentityLabel")}
                    />
                    <IdentityRow
                      label="Race / ethnicity"
                      value={identity.raceEthnicityLabel}
                      sensitive={SENSITIVE_KEYS.has("raceEthnicityLabel")}
                    />
                    <IdentityRow
                      label="Disability status"
                      value={identity.disabilityStatusLabel}
                      sensitive={SENSITIVE_KEYS.has("disabilityStatusLabel")}
                    />
                    <IdentityRow
                      label="Veteran status"
                      value={identity.veteranStatusLabel}
                      sensitive={SENSITIVE_KEYS.has("veteranStatusLabel")}
                    />
                    <IdentityRow label="LinkedIn" value={identity.linkedinUrl} sensitive={false} />
                    <IdentityRow label="Portfolio" value={identity.portfolioUrl} sensitive={false} />
                    <IdentityRow label="GitHub" value={identity.githubUrl} sensitive={false} />
                    {identity.education && identity.education.length > 0 && (
                      <div className="mt-1">
                        <span className="text-xs text-muted-foreground">Education: </span>
                        {identity.education.map((e) => (
                          <Badge key={e.id} variant="secondary" className="mr-1">
                            {e.school} {e.isPrimary ? "(primary)" : ""}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    No identity set up yet — fill it in on the Settings page.
                  </p>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Documents</div>
                <div className="mt-1 flex flex-col gap-1">
                  <ApplyDocLink label="Resume" docId={resumeDocId} />
                  <ApplyDocLink label="Cover letter" docId={coverDocId} />
                </div>
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Resolved answers ({pack.resolvedAnswers.length})
                </div>
                <div className="mt-1 space-y-2">
                  {pack.resolvedAnswers.length === 0 && (
                    <p className="text-muted-foreground">No answer snippets configured.</p>
                  )}
                  {pack.resolvedAnswers.map((a, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{a.question ?? a.questionKey}</span>
                        <CopyButton text={a.text} label="answer" />
                      </div>
                      <Textarea readOnly value={a.text} rows={2} className="text-xs" />
                      {a.unresolved.length > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Unresolved placeholders: {a.unresolved.join(", ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                <Button size="sm" variant="outline" onClick={copyAllAsJson}>
                  <Copy className="size-3.5" /> Copy all as JSON
                </Button>
              </div>

              <ApplyAssistHelperSection applicationId={applicationId} />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

// v8 Phase 6 — the apply-assist helper install/copy affordances. Three layers, in the plan's
// deliberate reliability order (in-app copy panel above is layer 1 and already the floor):
//   2. Userscript (Violentmonkey/Tampermonkey) — the main deliverable, served fresh per-application
//      by the API with identity data inlined server-side at request time (no runtime callback to
//      localhost from the page it runs on).
//   3. Bookmarklet — a convenience wrapper around the exact same script text, documented as
//      possibly CSP-blocked, never the primary path.
// Everything here is honest about the ceiling: Greenhouse/Lever/Ashby-style plain HTML forms fill
// well, iCIMS is fair, Workday's custom (non-native) dropdowns mostly won't fill and fall back to a
// flagged/skipped highlight — never oversell "autofills everything."
function ApplyAssistHelperSection({ applicationId }: { applicationId: string }) {
  const scriptUrl = api.applications.applyAssistScriptUrl(applicationId);
  const [bookmarkletHref, setBookmarkletHref] = useState<string | null>(null);
  const [bookmarkletError, setBookmarkletError] = useState<string | null>(null);

  async function buildBookmarklet() {
    setBookmarkletError(null);
    try {
      const res = await fetch(scriptUrl);
      if (!res.ok) throw new Error("Failed to fetch script");
      const scriptText = await res.text();
      // A bookmarklet has to be a single `javascript:` URI with no UserScript metadata block (the
      // browser executes it directly on click, in the PAGE's own world — unlike a userscript
      // manager, there's no isolated world here, which is exactly why this layer can be blocked by
      // a strict page CSP and is never positioned as the primary path).
      const body = scriptText.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n*/, "");
      setBookmarkletHref(`javascript:${encodeURIComponent(body)}`);
    } catch {
      setBookmarkletError("Couldn't build the bookmarklet — try the userscript install instead.");
    }
  }

  async function copyScriptUrl() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${scriptUrl}`);
      toast.success("Copied apply-assist script URL");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <section className="rounded-md border border-dashed p-2 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <Wand2 className="size-3.5" /> Apply-assist helper
      </div>
      <p className="mt-1 text-muted-foreground">
        A one-click, per-application browser helper that types this data into an ATS form's fields —
        it fills, highlights everything it touched, and stops. It never clicks Submit/Apply/Continue
        and never runs on its own; every run needs a fresh click on the button it adds to the page.
        EEO fields (gender/race/disability/veteran) get autofilled but visually flagged for your
        review. Quality varies by ATS: Greenhouse/Lever/Ashby fill well, iCIMS is fair, and Workday's
        custom dropdowns mostly won't fill — those get flagged instead, which is expected.
      </p>

      <div className="mt-2 space-y-2">
        <div>
          <div className="font-medium text-foreground">1. Userscript (recommended)</div>
          <p className="text-muted-foreground">
            Install a userscript manager (
            <a
              href="https://violentmonkey.github.io/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Violentmonkey
            </a>{" "}
            or Tampermonkey), then open the link below — it'll offer to install a script generated
            just for this application. Re-open it any time this application's data changes; it does
            not auto-update itself in the background.
          </p>
          <div className="mt-1 flex items-center gap-2">
            <a href={scriptUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Open apply-assist script
            </a>
            <CopyButton text={`${window.location.origin}${scriptUrl}`} label="script URL" />
          </div>
        </div>

        <div>
          <div className="font-medium text-foreground">2. Bookmarklet (fallback)</div>
          <p className="text-muted-foreground">
            A convenience wrapper around the same script as a browser-bar bookmark. Many ATS pages'
            Content Security Policy blocks bookmarklets entirely — if clicking it does nothing, use
            the userscript above instead.
          </p>
          <div className="mt-1">
            {bookmarkletHref ? (
              <a
                href={bookmarkletHref}
                onClick={(e) => {
                  e.preventDefault();
                  toast.info("Drag this text to your bookmarks bar instead of clicking it.");
                }}
                className="cursor-grab text-primary hover:underline"
                draggable
              >
                Apply Assist (drag me to bookmarks bar)
              </a>
            ) : (
              <Button size="sm" variant="outline" onClick={buildBookmarklet}>
                Build bookmarklet
              </Button>
            )}
            {bookmarkletError && <p className="mt-1 text-destructive">{bookmarkletError}</p>}
          </div>
        </div>

        <Button size="sm" variant="ghost" onClick={copyScriptUrl}>
          <Copy className="size-3.5" /> Copy script URL
        </Button>
      </div>
    </section>
  );
}

function ApplyDocLink({ label, docId }: { label: string; docId: string | null | undefined }) {
  if (!docId) {
    return <span className="text-muted-foreground">{label}: missing</span>;
  }
  return (
    <a
      href={api.documents.fileUrl(docId, true)}
      className="flex items-center gap-1 text-primary hover:underline"
    >
      <Download className="size-3.5" /> {label}: download
    </a>
  );
}
