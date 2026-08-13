import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck, ExternalLink, HelpCircle } from "lucide-react";
import { api } from "../api/client";
import type { Application } from "../api/types";
import { CATEGORY_LABELS } from "@/lib/labels";
import { relativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { PrepContextPanel } from "@/components/PrepContextPanel";
import { ApplyPanel } from "@/components/ApplyPanel";
import { useEntrance } from "@/lib/useEntrance";

const STALE_AFTER_DAYS = 7;

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

// "Approved but not prepped yet" — REVIEWING applications with no resume/cover letter attached.
// This is the visibility the tailoring skill lacked: previously the only way to find out what
// still needed a tailored draft was to scroll the whole Kanban board looking for missing icons.
export function Prep() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const entrance = useEntrance();

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setApplications(await api.applications.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load applications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const queue = useMemo(
    () =>
      applications
        .filter((a) => a.stage === "REVIEWING" && !a.resumeDocId && !a.coverDocId)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [applications]
  );

  async function copyPrepPrompt(app: Application) {
    const title = app.posting?.title ?? "this posting";
    const org = app.posting?.organization ?? "";
    const prompt = `Prep application ${app.id} (${title} at ${org}) using the tailor-application skill.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedId(app.id);
      setTimeout(() => setCopiedId((prev) => (prev === app.id ? null : prev)), 3000);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <PageLayout>
      <PageHeader
        icon={ClipboardCheck}
        title="Prep queue"
        description="Approved applications with no tailored resume or cover letter yet."
        count={{ value: queue.length, noun: "outstanding" }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">1. Copy prompt</span>
        <span aria-hidden="true">→</span>
        <span className="font-medium text-foreground">2. Run tailor-application in Claude</span>
        <span aria-hidden="true">→</span>
        <span className="font-medium text-foreground">3. Attach the doc on Pipeline</span>
        <Popover>
          <PopoverTrigger
            render={<Button variant="ghost" size="icon-xs" className="ml-auto" aria-label="What happens next?" />}
          >
            <HelpCircle />
          </PopoverTrigger>
          <PopoverContent>
            The tailor-application skill drafts a tailored resume and/or cover letter for you to
            review — it never submits anything on its own. A human always reviews and attaches
            the finished document to the application on Pipeline before anything is sent.
          </PopoverContent>
        </Popover>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <ErrorState title="Failed to load applications" error={error} onRetry={load} />
      ) : queue.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nothing outstanding"
          description="Every approved application already has a tailored resume or cover letter attached."
        />
      ) : (
        <div className="grid gap-3">
          {queue.map((app, index) => {
            const age = daysSince(app.createdAt);
            const stale = age > STALE_AFTER_DAYS;
            return (
              <Card key={app.id} {...entrance(index)}>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        {app.posting?.title}
                        {app.posting?.url && (
                          <a
                            href={app.posting.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-primary"
                            aria-label="Open original posting"
                            title="Open original posting"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {app.posting?.organization} · {app.posting?.location ?? "location unknown"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {app.posting?.category && (
                          <Badge variant="secondary">{CATEGORY_LABELS[app.posting.category]}</Badge>
                        )}
                        <span
                          className={`text-xs ${stale ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                        >
                          Approved {relativeTime(app.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyPrepPrompt(app)}>
                    {copiedId === app.id ? "Copied — now attach on Pipeline" : "Copy prep prompt"}
                  </Button>
                </CardContent>
                <CardContent className="space-y-2 pt-0">
                  <PrepContextPanel applicationId={app.id} defaultOpen={false} />
                  <ApplyPanel applicationId={app.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
