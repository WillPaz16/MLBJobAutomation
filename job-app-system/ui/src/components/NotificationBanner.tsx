import { useEffect, useState } from "react";
import { api } from "@/api/client";

// Shared between Home and Discovery — surfaces the most recent scheduled discovery run's outcome
// (success or failure) so a failed scrape is visible next time the app is opened, not just buried
// in a log file.
export function NotificationBanner() {
  const [latest, setLatest] = useState<{ summary: string; createdAt: string } | null>(null);

  useEffect(() => {
    api.notifications
      .list()
      .then((logs) => setLatest(logs[0] ?? null))
      .catch(() => {
        // silently skip — a failed notification fetch shouldn't block the rest of the page
      });
  }, []);

  if (!latest) return null;
  const isFailure = latest.summary.startsWith("⚠️");

  return (
    <div
      className={`mb-4 rounded-md border px-3 py-2 text-sm ${
        isFailure
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span className="font-medium">Last discovery run</span> ({new Date(latest.createdAt).toLocaleString()}):{" "}
      {latest.summary}
    </div>
  );
}
