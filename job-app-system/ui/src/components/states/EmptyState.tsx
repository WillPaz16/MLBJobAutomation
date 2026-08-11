import type { ReactNode } from "react";

// Two variants: "empty" (genuinely nothing exists yet) and "no-matches" (filters/search excluded
// everything). Only differ in framing today — both render the same layout — but kept as a
// discriminated prop so a page can pick the right copy without inventing its own.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "empty",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  variant?: "empty" | "no-matches";
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center" data-variant={variant}>
      <Icon className="size-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
