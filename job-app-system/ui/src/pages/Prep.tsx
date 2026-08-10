import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { api } from "../api/client";
import type { Application } from "../api/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

// "Approved but not prepped yet" — REVIEWING applications with no resume/cover letter attached.
// This is the visibility the tailoring skill lacked: previously the only way to find out what
// still needed a tailored draft was to scroll the whole Kanban board looking for missing icons.
export function Prep() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      toast.success("Prep prompt copied — paste it into chat");
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-foreground">
          Prep queue — approved applications with no tailored resume or cover letter yet
        </h1>
        <span className="text-sm text-muted-foreground">{queue.length} outstanding</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load applications: {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      ) : queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing outstanding — every approved application already has a tailored resume or cover
          letter attached.
        </p>
      ) : (
        <div className="grid gap-3">
          {queue.map((app) => (
            <div key={app.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
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
                  {app.posting?.category && (
                    <Badge variant="secondary" className="mt-1">
                      {app.posting.category.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => copyPrepPrompt(app)}>
                Copy prep prompt
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
