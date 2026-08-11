import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

// When `to` is given, wrap the whole Card in a plain react-router <Link> instead of composing
// with the Button component — sidesteps Base UI's nativeButton requirement entirely (no button
// semantics are needed here, just a clickable card).
export function StatCard({
  label,
  value,
  to,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string | number;
  to?: string;
  icon?: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  const content = (
    <Card className="animate-in fade-in slide-in-from-bottom-1 duration-300">
      <CardContent className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tabular text-foreground">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {Icon && <Icon className="size-5 text-primary" />}
      </CardContent>
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block transition-transform hover:-translate-y-0.5">
        {content}
      </Link>
    );
  }
  return content;
}
