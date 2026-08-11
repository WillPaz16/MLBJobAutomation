import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { api } from "../api/client";
import type { AnalyticsSummary, AnalyticsTimeseries } from "../api/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prettifyLabel } from "@/lib/labels";
import { ErrorState } from "@/components/states/ErrorState";
import { StatCard } from "@/components/StatCard";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { BarList } from "@/components/charts/BarList";
import { TimeSeries } from "@/components/charts/TimeSeries";
import { Histogram } from "@/components/charts/Histogram";
import { DotPlot } from "@/components/charts/DotPlot";
import { Sparkline } from "@/components/charts/Sparkline";
import { histogram } from "@/lib/timeSeries";

// Funnel-ordered but deliberately NOT labeled "funnel" — there's no stage-transition history
// table, so this is a snapshot of where applications currently sit, not a flow.
const STAGE_ORDER = ["FOUND", "REVIEWING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

function LoadingSkeleton() {
  return (
    <PageLayout>
      <Skeleton className="mb-4 h-9 w-48" />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="mb-6 h-64 rounded-lg" />
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    </PageLayout>
  );
}

export function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, timeseriesRes] = await Promise.all([api.analytics.summary(), api.analytics.timeseries()]);
      setSummary(summaryRes);
      setTimeseries(timeseriesRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingSkeleton />;

  if (error || !summary || !timeseries) {
    return (
      <PageLayout>
        <ErrorState title="Failed to load analytics" error={error ?? "No data returned"} onRetry={load} />
      </PageLayout>
    );
  }

  const bySourceEntries = Object.entries(summary.bySource).sort((a, b) => b[1] - a[1]);
  const top8 = bySourceEntries.slice(0, 8);
  const otherTotal = bySourceEntries.slice(8).reduce((sum, [, v]) => sum + v, 0);
  const bySourceBars = [
    ...top8.map(([key, value]) => ({ label: prettifyLabel(key), value })),
    ...(otherTotal > 0 ? [{ label: "Other", value: otherTotal, color: "var(--chart-grid)" }] : []),
  ];

  const byStageBars = STAGE_ORDER.filter((s) => summary.byStage[s] !== undefined).map((stage) => ({
    label: prettifyLabel(stage),
    value: summary.byStage[stage],
  }));

  const dotPlotEntries = STAGE_ORDER.filter((s) => summary.avgResponseDaysByStage[s] !== undefined).map(
    (stage) => ({ label: prettifyLabel(stage), value: summary.avgResponseDaysByStage[stage] })
  );

  const fitBins = histogram(timeseries.fitScores, 5, [0, 100]);
  const fitBinLabels = ["0-20", "20-40", "40-60", "60-80", "80-100"];

  const weekLabels = timeseries.weeks.map((w) =>
    new Date(w).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );

  const totalDiscovered = timeseries.discovered.reduce((a, b) => a + b, 0);

  return (
    <PageLayout>
      <PageHeader icon={BarChart3} title="Analytics" description="How discovery and the pipeline are trending." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total applications" value={summary.total} />
        <StatCard
          label="Avg. response time"
          value={summary.avgResponseDays !== null ? `${summary.avgResponseDays.toFixed(1)}d` : "—"}
        />
        <StatCard label="Sources" value={Object.keys(summary.bySource).length} />
        <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          <CardContent className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">Postings discovered (26wk)</div>
              <div className="text-2xl font-semibold tabular text-foreground">{totalDiscovered}</div>
            </div>
            <Sparkline
              values={timeseries.discovered}
              label="Postings discovered per week, last 26 weeks"
              color="var(--chart-1)"
            />
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Discovery and pipeline activity</CardTitle>
          <CardDescription>Weekly postings discovered vs. applications created vs. applied, last 26 weeks.</CardDescription>
        </CardHeader>
        <CardContent>
          <TimeSeries
            title="Discovered vs. applications created vs. applied, weekly"
            labels={weekLabels}
            series={[
              { label: "Discovered", color: "var(--chart-1)", values: timeseries.discovered },
              { label: "Applications created", color: "var(--chart-2)", values: timeseries.applicationsCreated },
              { label: "Applied", color: "var(--chart-3)", values: timeseries.applied },
            ]}
          />
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fit score distribution</CardTitle>
            <CardDescription>
              {timeseries.fitScores.length > 0
                ? `${timeseries.fitScores.length} scored postings`
                : "Set up a candidate profile on the Compatibility page to see this"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Histogram title="Fit score distribution" bins={fitBins} binLabels={fitBinLabels} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Current stage</CardTitle>
            <CardDescription>Where applications sit right now — a snapshot, not a flow.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList entries={byStageBars} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
            <CardDescription>Top 8 platforms, remainder grouped as "Other".</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList entries={bySourceBars} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Avg. response by stage</CardTitle>
            <CardDescription>Days between applying and reaching each stage.</CardDescription>
          </CardHeader>
          <CardContent>
            <DotPlot title="Average response time by stage, in days" entries={dotPlotEntries} />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
