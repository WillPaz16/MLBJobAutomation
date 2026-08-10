import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AnalyticsSummary } from "../api/types";
import { Skeleton } from "@/components/ui/skeleton";

export function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSummary(await api.analytics.summary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4 p-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load analytics: {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Total applications" value={summary.total} />
        <Stat
          label="Avg. response time"
          value={summary.avgResponseDays !== null ? `${summary.avgResponseDays.toFixed(1)}d` : "—"}
        />
        <Stat label="Sources" value={Object.keys(summary.bySource).length} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Breakdown title="By stage" data={summary.byStage} />
        <Breakdown title="By source" data={summary.bySource} />
      </div>

      <div className="mt-6">
        <Breakdown
          title="Avg. response time by stage (days)"
          data={Object.fromEntries(
            Object.entries(summary.avgResponseDaysByStage).map(([k, v]) => [k, Number(v.toFixed(1))])
          )}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-foreground">{title}</h2>
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 text-muted-foreground">{key.replace(/_/g, " ")}</span>
            <div className="h-2 flex-1 rounded bg-muted">
              <div className="h-2 rounded bg-primary" style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right text-foreground">{value}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-muted-foreground">No data yet</p>}
      </div>
    </div>
  );
}
