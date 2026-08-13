import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// Kills 12 copies of `<div><Label className="mb-1">…</Label>{control}</div>` that used to be
// hand-repeated across Discovery's filter bar (one per filter). `htmlFor`/`id` are matched by the
// caller passing the same `id` string to both this component and its child control, same as every
// existing filter cell did manually.
export function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1">
        {label}
      </Label>
      {children}
    </div>
  );
}
