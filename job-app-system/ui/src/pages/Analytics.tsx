import { useEffect, useState } from "react";
import { BarChart3, Filter } from "lucide-react";
import { api } from "../api/client";
import type { AnalyticsFunnel, AnalyticsMarket, AnalyticsSummary, AnalyticsTimeseries } from "../api/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prettifyLabel } from "@/lib/labels";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { StatCard } from "@/components/StatCard";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { BarList } from "@/components/charts/BarList";
import { TimeSeries } from "@/components/charts/TimeSeries";
import { Histogram } from "@/components/charts/Histogram";
import { DotPlot } from "@/components/charts/DotPlot";
import { Sparkline } from "@/components/charts/Sparkline";
import { histogram } from "@/lib/timeSeries";

// Stage order for the current-snapshot bar list (not a "funnel" — the real, timing-aware funnel
// lives in the "Application funnel" section below, driven by ApplicationStageEvent).
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

function statLabel(s: { median: number | null; mean: number | null; n: number }, unit = "d"): string {
  if (s.n === 0 || s.median === null) return "—";
  return `${s.median.toFixed(1)}${unit} median (n=${s.n})`;
}

export function Analytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [timeseries, setTimeseries] = useState<AnalyticsTimeseries | null>(null);
  const [funnel, setFunnel] = useState<AnalyticsFunnel | null>(null);
  const [market, setMarket] = useState<AnalyticsMarket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, timeseriesRes, funnelRes, marketRes] = await Promise.all([
        api.analytics.summary(),
        api.analytics.timeseries(),
        api.analytics.funnel(),
        api.analytics.market(),
      ]);
      setSummary(summaryRes);
      setTimeseries(timeseriesRes);
      setFunnel(funnelRes);
      setMarket(marketRes);
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

  if (error || !summary || !timeseries || !funnel || !market) {
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

  const fitBins = histogram(timeseries.fitScores, 5, [0, 100]);
  const fitBinLabels = ["0-20", "20-40", "40-60", "60-80", "80-100"];

  const weekLabels = timeseries.weeks.map((w) =>
    new Date(w).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );

  const totalDiscovered = timeseries.discovered.reduce((a, b) => a + b, 0);

  // Funnel: honest empty state when nothing has reached APPLIED yet — no zero-valued charts.
  const hasFunnelData = funnel.sampleSizes.appliedReached > 0;
  const funnelStageOrder = ["FOUND", "REVIEWING", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];
  const conversionBars = funnelStageOrder
    .filter((s) => funnel.conversion[s] !== undefined && funnel.conversion[s] !== null)
    .map((stage) => ({
      label: prettifyLabel(stage),
      value: Math.round((funnel.conversion[stage] as number) * 100),
    }));
  const daysInStageEntries = funnelStageOrder
    .filter((s) => funnel.daysInStage[s] && funnel.daysInStage[s].n > 0)
    .map((stage) => ({ label: prettifyLabel(stage), value: funnel.daysInStage[stage].median ?? 0 }));

  const fitCohortEntries = [
    { key: "dismissed", label: "Dismissed", stats: market.fitScoreByCohort.dismissed, color: "var(--chart-4, var(--chart-2))" },
    { key: "applied", label: "Has application", stats: market.fitScoreByCohort.applied, color: "var(--chart-1)" },
    { key: "other", label: "Everything else", stats: market.fitScoreByCohort.other, color: "var(--chart-grid)" },
  ];
  const fitCohortMax = Math.max(1, ...fitCohortEntries.map((e) => e.stats.mean ?? 0));

  return (
    <PageLayout>
      <PageHeader icon={BarChart3} title="Analytics" description="How discovery and the pipeline are trending." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total applications" value={summary.total} />
        <StatCard
          label="Median response time"
          value={funnel.medianDaysToResponse !== null ? `${funnel.medianDaysToResponse.toFixed(1)}d` : "—"}
          hint={`n=${funnel.sampleSizes.responseSampleSize}`}
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

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By source</CardTitle>
            <CardDescription>Top 8 platforms, remainder grouped as "Other".</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList entries={bySourceBars} />
          </CardContent>
        </Card>

        {/* Real funnel — built from ApplicationStageEvent history, not a snapshot. Renders an
            honest empty state instead of zero-valued charts until an application has actually
            reached APPLIED. */}
        <Card>
          <CardHeader>
            <CardTitle>Application funnel</CardTitle>
            <CardDescription>Conversion rate into each stage, relative to Applied.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasFunnelData ? (
              <BarList
                entries={conversionBars.map((b) => ({ ...b, label: `${b.label} (${b.value}%)` }))}
                max={100}
              />
            ) : (
              <EmptyState
                icon={Filter}
                title="No applications have reached Applied yet"
                description="Move an application to Applied on the Pipeline to start seeing real funnel conversion data."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Median days in stage</CardTitle>
            <CardDescription>How long an application typically sits before its next real transition.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasFunnelData && daysInStageEntries.length > 0 ? (
              <DotPlot title="Median days spent in each stage" entries={daysInStageEntries} />
            ) : (
              <EmptyState
                icon={Filter}
                title="Not enough transition history yet"
                description="This needs at least two real stage moves on the same application to measure a gap."
              />
            )}
          </CardContent>
        </Card>

        {/* Highest-value market chart per the phase-5 plan: does the profile's calibration match
            reality — are dismissed postings actually scoring lower than applied ones? */}
        <Card>
          <CardHeader>
            <CardTitle>Fit score by cohort</CardTitle>
            <CardDescription>Mean fit score: dismissed vs. applied-to vs. everything else.</CardDescription>
          </CardHeader>
          <CardContent>
            {fitCohortEntries.some((e) => e.stats.n > 0) ? (
              <div className="space-y-3">
                {fitCohortEntries.map((entry) => (
                  <div key={entry.key} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 text-muted-foreground">{entry.label}</span>
                    <div className="h-4 flex-1 rounded-full bg-muted">
                      <div
                        className="h-4 rounded-full transition-[width] duration-300"
                        style={{
                          width: `${Math.min(100, ((entry.stats.mean ?? 0) / fitCohortMax) * 100)}%`,
                          backgroundColor: entry.color,
                        }}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right tabular text-foreground">{statLabel(entry.stats, "")}</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Filter}
                title="No fit-scored cohort data yet"
                description="Set up a candidate profile on the Compatibility page, then dismiss or apply to a few postings."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Time to close</CardTitle>
            <CardDescription>
              Days from posted (or discovered, when postedAt is unknown) to closed —{" "}
              {market.timeToClose.postedAtBasedCount} used a real posted date,{" "}
              {market.timeToClose.discoveredAtFallbackCount} fell back to discovery date.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">MLB teams</div>
                <Histogram title="Time to close, MLB" bins={market.timeToClose.mlb} binLabels={market.timeToClose.bucketLabels} width={280} />
              </div>
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Non-MLB</div>
                <Histogram title="Time to close, non-MLB" bins={market.timeToClose.nonMlb} binLabels={market.timeToClose.bucketLabels} width={280} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dismissals by category</CardTitle>
            <CardDescription>Which categories get dismissed most often.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList
              entries={market.dismissalBreakdown.category.map((e) => ({ label: prettifyLabel(e.key), value: e.value }))}
            />
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
