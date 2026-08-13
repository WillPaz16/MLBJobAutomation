import { useEffect, useState } from "react";

// Shared debounce hook — previously duplicated verbatim in Discovery.tsx and Compatibility.tsx
// (v9 Phase 6 cleanup). Debounces `value`, re-emitting `delayMs` after the last change.
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
