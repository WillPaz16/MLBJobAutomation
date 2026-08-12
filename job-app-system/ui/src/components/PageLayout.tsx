import type { ReactNode } from "react";

const WIDTH_CLASSES = {
  wide: "mx-auto max-w-7xl p-6",
  narrow: "mx-auto max-w-2xl p-6",
  full: "p-6",
} as const;

export function PageLayout({
  children,
  width = "wide",
}: {
  children: ReactNode;
  width?: keyof typeof WIDTH_CLASSES;
}) {
  return <div className={WIDTH_CLASSES[width]}>{children}</div>;
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  count,
  actions,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  count?: { value: number; noun: string };
  actions?: ReactNode;
}) {
  return (
    <div className="relative mb-4 overflow-hidden">
      {/* Masked chalk band — the baseball motif beyond Home's hero, faded out toward the right
          via a linear mask rather than a hard edge. Not used on Nav (fights backdrop-blur) or on
          Cards (index.css already forbids the wash there for legibility). */}
      <div
        className="bg-chalk pointer-events-none absolute inset-0 opacity-60"
        style={{
          maskImage: "linear-gradient(to right, black, transparent 60%)",
          WebkitMaskImage: "linear-gradient(to right, black, transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-5 text-primary" />}
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          {count && (
            <p className="mt-1 text-sm text-muted-foreground">
              {count.value.toLocaleString()} {count.noun}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
