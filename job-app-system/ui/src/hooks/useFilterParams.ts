import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

// Discovery's filter state lived in 9 separate useState calls plus `page`, driving two
// useEffects keyed on the same 9-item dependency list (one resets page, one fetches) — a filter
// change while on page >= 1 could fire the fetch effect twice (page-reset render + page-set
// render). Moving filters + page into the URL via useSearchParams collapses that to one
// setSearchParams call -> one render -> one fetch, with no react-hooks/exhaustive-deps
// suppression needed on the consuming fetch effect (see Discovery.tsx: `useEffect(() => load(),
// [searchParams.toString()])`).
//
// Only non-default values are ever written into the URL, so a page with no filters set stays a
// clean URL with no query string.

export type FilterDefaults = Record<string, string>;

export function useFilterParams<T extends FilterDefaults>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo(() => {
    const result = { ...defaults } as T;
    for (const key of Object.keys(defaults) as (keyof T)[]) {
      const raw = searchParams.get(key as string);
      if (raw !== null) result[key] = raw as T[keyof T];
    }
    return result;
  }, [searchParams, defaults]);

  // Update one filter + reset page to 1 in a single setSearchParams call — this is the actual
  // fix for the double-load bug: one URL mutation, one re-render, one fetch.
  const setFilter = useCallback(
    (key: keyof T & string, value: string, options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const current = prev.get(key) ?? defaults[key];
          // No-op unless the value is actually changing — otherwise a mount-time effect (e.g.
          // the debounced-text-input effects re-asserting their current, unchanged value) would
          // unconditionally strip the "page" param below and silently reset pagination with no
          // real filter change.
          if (current === value) return prev;
          const next = new URLSearchParams(prev);
          if (value === defaults[key] || value === "") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
          next.delete("page");
          return next;
        },
        { replace: options?.replace }
      );
    },
    [setSearchParams, defaults]
  );

  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  const setPage = useCallback(
    (nextPage: number) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (nextPage <= 1) next.delete("page");
        else next.set("page", String(nextPage));
        return next;
      });
    },
    [setSearchParams]
  );

  const activeFilters = useMemo(
    () =>
      (Object.keys(defaults) as (keyof T & string)[])
        .filter((key) => filters[key] !== defaults[key])
        .map((key) => ({ key, value: filters[key] as string })),
    [filters, defaults]
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const clearFilter = useCallback(
    (key: keyof T & string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        next.delete("page");
        return next;
      });
    },
    [setSearchParams]
  );

  return { filters, setFilter, page, setPage, activeFilters, clearFilters, clearFilter, searchParams };
}
