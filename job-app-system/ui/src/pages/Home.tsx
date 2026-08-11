import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Compass, ListChecks, Search } from "lucide-react";
import { api, ApiError } from "@/api/client";
import type { AnalyticsSummary, Application } from "@/api/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBanner } from "@/components/NotificationBanner";
import { StatCard } from "@/components/StatCard";
import { prettifyLabel } from "@/lib/labels";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const ACTIVE_STAGES = ["REVIEWING", "APPLIED", "INTERVIEW", "OFFER"] as const;

// Per-source fetch state, independent per stat — replaces the old shared `null` sentinel, which
// made a partial failure indistinguishable from a real zero (all three had to be null for the
// page to know it was "loading" at all).
type Loadable<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; value: T };

function StatSlot({
  label,
  to,
  state,
  render,
}: {
  label: string;
  to: string;
  state: Loadable<unknown>;
  render: () => string | number;
}) {
  if (state.status === "loading") {
    return <Skeleton className="h-20 rounded-lg" />;
  }
  if (state.status === "error") {
    return (
      <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300 border-destructive/30">
        <CardContent className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-sm font-medium text-destructive">Couldn't load</div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return <StatCard label={label} value={render()} to={to} />;
}

function QuickLink({
  to,
  icon: Icon,
  title,
  description,
  index,
}: {
  to: string;
  icon: typeof Compass;
  title: string;
  description: string;
  index: number;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="flex flex-col gap-3">
        <Icon className="size-5 text-primary" />
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-auto w-fit"
          nativeButton={false}
          render={<Link to={to} />}
        >
          Open
        </Button>
      </CardContent>
    </Card>
  );
}

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

export function Home() {
  const [activePostings, setActivePostings] = useState<Loadable<number>>({ status: "loading" });
  const [applications, setApplications] = useState<Loadable<Application[]>>({ status: "loading" });
  const [summary, setSummary] = useState<Loadable<AnalyticsSummary>>({ status: "loading" });

  useEffect(() => {
    api.postings
      .list({ status: "active", take: 1 })
      .then(({ total }) => setActivePostings({ status: "ok", value: total }))
      .catch((err) => setActivePostings({ status: "error", message: errorMessage(err) }));
    api.applications
      .list()
      .then((value) => setApplications({ status: "ok", value }))
      .catch((err) => setApplications({ status: "error", message: errorMessage(err) }));
    api.analytics
      .summary()
      .then((value) => setSummary({ status: "ok", value }))
      .catch((err) => setSummary({ status: "error", message: errorMessage(err) }));
  }, []);

  const applicationList = applications.status === "ok" ? applications.value : null;
  const activeApplicationCount = applicationList?.filter((a) =>
    (ACTIVE_STAGES as readonly string[]).includes(a.stage)
  ).length;

  const totalPostings = activePostings.status === "ok" ? activePostings.value : null;

  return (
    <div>
      {/* Full-bleed hero band — replaces the old unused hero.png (a small 343x361 raster that
          nothing imported and couldn't respond to theme). .bg-field + .bg-chalk are Phase 1's
          ambient-wash/chalk-line utilities; the mask fades the chalk lines out toward the bottom
          instead of hard-edging them. */}
      <div
        className="bg-field relative overflow-hidden border-b px-6 py-10"
        style={{
          maskImage: "linear-gradient(to bottom, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      >
        <div
          className="bg-chalk absolute inset-0"
          style={{
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-7xl">
          <div className="text-gradient-brand animate-in fade-in slide-in-from-bottom-1 text-3xl font-semibold duration-300">
            {greeting()}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalPostings !== null
              ? `${totalPostings.toLocaleString()} active postings tracked · ${
                  activeApplicationCount ?? 0
                } active application${activeApplicationCount === 1 ? "" : "s"}`
              : "Here's where things stand."}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        <NotificationBanner />

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatSlot
            label="Active postings"
            to="/discovery"
            state={activePostings}
            render={() => (activePostings.status === "ok" ? activePostings.value : "—")}
          />
          <StatSlot
            label="Active applications"
            to="/pipeline"
            state={applications}
            render={() => activeApplicationCount ?? "—"}
          />
          <StatSlot
            label="Avg. response time"
            to="/analytics"
            state={summary}
            render={() =>
              summary.status === "ok" && summary.value.avgResponseDays != null
                ? `${summary.value.avgResponseDays.toFixed(1)}d`
                : "—"
            }
          />
        </div>

        {applicationList && applicationList.length > 0 && (
          <div className="mb-6">
            <div className="mb-2 text-sm font-semibold text-foreground">Pipeline by stage</div>
            <div className="flex flex-wrap gap-2">
              {ACTIVE_STAGES.map((stage) => {
                const count = applicationList.filter((a) => a.stage === stage).length;
                if (count === 0) return null;
                return (
                  <span
                    key={stage}
                    className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground"
                  >
                    {prettifyLabel(stage)}: {count}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QuickLink
            to="/discovery"
            icon={Search}
            title="Discovery"
            description="Browse and filter newly found postings."
            index={0}
          />
          <QuickLink
            to="/pipeline"
            icon={ListChecks}
            title="Pipeline"
            description="Track applications through each stage."
            index={1}
          />
          <QuickLink
            to="/prep"
            icon={ClipboardList}
            title="Prep queue"
            description="See what still needs a tailored resume or cover letter."
            index={2}
          />
        </div>
      </div>
    </div>
  );
}
