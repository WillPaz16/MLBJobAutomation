import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AnalyticsSummary } from "../api/types";

export function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    api.analytics.summary().then(setSummary);
  }, []);

  if (!summary) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h2>
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 text-gray-500">{key.replace(/_/g, " ")}</span>
            <div className="h-2 flex-1 rounded bg-gray-100 dark:bg-gray-800">
              <div
                className="h-2 rounded bg-purple-500"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right text-gray-700 dark:text-gray-300">{value}</span>
          </div>
        ))}
        {entries.length === 0 && <p className="text-sm text-gray-400">No data yet</p>}
      </div>
    </div>
  );
}
