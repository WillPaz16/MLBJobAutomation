import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Compass, ListChecks, Search } from "lucide-react";
import { api } from "@/api/client";
import type { AnalyticsSummary, Application } from "@/api/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBanner } from "@/components/NotificationBanner";
import { prettifyLabel } from "@/lib/labels";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const ACTIVE_STAGES = ["REVIEWING", "APPLIED", "INTERVIEW", "OFFER"] as const;

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      <CardContent>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof Compass;
  title: string;
  description: string;
}) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500">
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

export function Home() {
  const [activePostings, setActivePostings] = useState<number | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    api.postings
      .list({ status: "active", take: 1 })
      .then(({ total }) => setActivePostings(total))
      .catch(() => setActivePostings(null));
    api.applications
      .list()
      .then(setApplications)
      .catch(() => setApplications(null));
    api.analytics
      .summary()
      .then(setSummary)
      .catch(() => setSummary(null));
  }, []);

  const activeApplicationCount = applications?.filter((a) =>
    (ACTIVE_STAGES as readonly string[]).includes(a.stage)
  ).length;

  const loading = activePostings === null && applications === null && summary === null;

  return (
    <div className="p-6">
      <div className="animate-in fade-in slide-in-from-bottom-1 mb-1 text-2xl font-semibold text-foreground duration-300">
        {greeting()}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">Here's where things stand.</p>
      <NotificationBanner />

      {loading ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Active postings" value={activePostings ?? "—"} />
          <Stat label="Active applications" value={activeApplicationCount ?? "—"} />
          <Stat
            label="Avg. response time"
            value={summary?.avgResponseDays != null ? `${summary.avgResponseDays.toFixed(1)}d` : "—"}
          />
        </div>
      )}

      {applications && applications.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-sm font-semibold text-foreground">Pipeline by stage</div>
          <div className="flex flex-wrap gap-2">
            {ACTIVE_STAGES.map((stage) => {
              const count = applications.filter((a) => a.stage === stage).length;
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
        />
        <QuickLink
          to="/pipeline"
          icon={ListChecks}
          title="Pipeline"
          description="Track applications through each stage."
        />
        <QuickLink
          to="/prep"
          icon={ClipboardList}
          title="Prep queue"
          description="See what still needs a tailored resume or cover letter."
        />
      </div>
    </div>
  );
}
