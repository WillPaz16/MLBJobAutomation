import { useEffect, useRef } from "react";

// Mount/route-change entrance only — never on filter, pagination, sort, or refetch. Gates on a
// first-render ref: after the initial mount's effect runs, `done` flips true and every subsequent
// call returns `{}` (no animation classes), so re-rendering the same list after a filter change
// or refetch doesn't re-trigger the stagger. Stagger is capped at index 8 so a long list doesn't
// produce a multi-second cascade. The existing prefers-reduced-motion guard in index.css already
// neutralizes animation-duration/iteration-count, so this needs no separate reduced-motion check.
export function useEntrance() {
  const done = useRef(false);
  useEffect(() => {
    done.current = true;
  }, []);
  return (index: number) =>
    done.current
      ? {}
      : {
          className: "animate-in fade-in slide-in-from-bottom-1 duration-300",
          style: { animationDelay: `${Math.min(index, 8) * 40}ms`, animationFillMode: "backwards" as const },
        };
}
