import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

// Two variants that now genuinely render differently (previously identical layout regardless of
// which was passed): "empty" = genuinely nothing exists yet — a chalk-textured dashed panel with
// a primary-tinted icon, evoking the same baseball motif as PageHeader/Home. "no-matches" =
// filters/search excluded everything that does exist — a solid muted panel with a neutral icon,
// since this isn't "there's nothing here," it's "loosen your filters."
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onClear,
  variant = "empty",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Renders a "Clear filters" ghost button when provided — not restricted to no-matches, though
      that's the common case. */
  onClear?: () => void;
  variant?: "empty" | "no-matches";
}) {
  const isEmpty = variant === "empty";

  return (
    <div
      className={
        isEmpty
          ? "relative overflow-hidden rounded-lg border border-dashed p-10 text-center"
          : "rounded-lg border bg-muted/30 p-10 text-center"
      }
      data-variant={variant}
    >
      {isEmpty && (
        <div
          className="bg-chalk pointer-events-none absolute inset-0 opacity-40"
          style={{
            maskImage: "radial-gradient(circle, black, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, black, transparent 70%)",
          }}
          aria-hidden="true"
        />
      )}
      <div className="relative flex flex-col items-center gap-2">
        <Icon className={isEmpty ? "size-8 text-primary" : "size-8 text-muted-foreground"} />
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
        {(action || onClear) && (
          <div className="mt-2 flex items-center gap-2">
            {action}
            {onClear && (
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
