import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared shape for the inline "failed to load X: {error} Retry" block every page previously
// hand-rolled with a raw underlined <button>. Matches the existing border-destructive/bg-
// destructive/5 treatment those blocks used.
export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-destructive/90">{error}</div>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCw className="size-3.5" />
        Retry
      </Button>
    </div>
  );
}
