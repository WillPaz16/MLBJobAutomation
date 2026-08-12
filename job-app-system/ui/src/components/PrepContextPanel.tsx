import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { api, ApiError } from "../api/client";
import type { PrepContext } from "../api/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Read-only summary of what the tailor-application skill would see for this application —
// resolved tone, matched org profile, applicable resume bullets, and attached documents. No
// add/edit/delete controls here; that framework's CRUD UI is explicitly out of scope (see
// CLAUDE.md's "Tailoring framework" note) — this panel only surfaces what's already resolved.
export function PrepContextPanel({
  applicationId,
  defaultOpen = false,
}: {
  applicationId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [context, setContext] = useState<PrepContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || context) return;
    setLoading(true);
    setError(null);
    api
      .applications.prepContext(applicationId)
      .then(setContext)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load prep context"))
      .finally(() => setLoading(false));
  }, [open, applicationId, context]);

  const bulletsByCategory = context?.resumeBullets.reduce<Record<string, typeof context.resumeBullets>>(
    (acc, b) => {
      (acc[b.category] ??= []).push(b);
      return acc;
    },
    {}
  );

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        Prep context
        <span className="text-xs font-normal text-muted-foreground">
          (tone, org notes, bullets, attached docs)
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3 text-sm">
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : error ? (
            <div className="text-xs text-destructive">{error}</div>
          ) : context ? (
            <>
              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Tone</div>
                {context.tonePreset ? (
                  <div className="mt-1">
                    <div className="font-medium">
                      {context.tonePreset.name}{" "}
                      {context.orgProfile?.preferredToneId === context.tonePreset.id ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          (from OrgProfile for {context.orgProfile.organizationName})
                        </span>
                      ) : (
                        <span className="text-xs font-normal text-muted-foreground">
                          (default preset, no org override)
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{context.tonePreset.guidance}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">No tone preset configured.</p>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Org profile
                </div>
                {context.orgProfile ? (
                  <p className="mt-1 text-muted-foreground">{context.orgProfile.notes || "(no notes)"}</p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    No profile for {context.application.posting?.organization ?? "this organization"} yet.
                  </p>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Applicable resume bullets ({context.resumeBullets.length})
                </div>
                {bulletsByCategory && Object.keys(bulletsByCategory).length > 0 ? (
                  <div className="mt-1 space-y-2">
                    {Object.entries(bulletsByCategory).map(([category, bullets]) => (
                      <div key={category}>
                        <Badge variant="secondary" className="mb-1">
                          {category} ({bullets.length})
                        </Badge>
                        <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                          {bullets.map((b) => (
                            <li key={b.id}>{b.text}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">No matching bullets.</p>
                )}
              </section>

              <section>
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  Attached documents
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  <DocLink label="Resume" docId={context.application.resumeDocId} />
                  <DocLink label="Cover letter" docId={context.application.coverDocId} />
                </div>
              </section>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function DocLink({ label, docId }: { label: string; docId: string | null | undefined }) {
  if (!docId) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <FileText className="size-3.5" /> {label}: missing
      </span>
    );
  }
  return (
    <a
      href={api.documents.fileUrl(docId)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1 text-primary hover:underline"
    >
      <ExternalLink className="size-3.5" /> {label}: open file
    </a>
  );
}
