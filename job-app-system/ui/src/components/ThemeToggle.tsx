import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ThemeMode = "system" | "light" | "dark";
const STORAGE_KEY = "theme-mode";

export function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

// Applies the given mode to <html class="dark">, resolving "system" against the current OS
// preference. Exported so main.tsx's matchMedia listener can reapply it whenever the OS setting
// changes AND the stored mode is still "system" — see main.tsx for that gating.
export function applyThemeMode(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: "light", label: "Light", icon: Sun },
  { mode: "dark", label: "Dark", icon: Moon },
  { mode: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredThemeMode());

  useEffect(() => {
    applyThemeMode(mode);
  }, [mode]);

  function choose(next: ThemeMode) {
    localStorage.setItem(STORAGE_KEY, next);
    setMode(next);
  }

  const Current = OPTIONS.find((o) => o.mode === mode)?.icon ?? Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Change theme" />}>
        <Current className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ mode: optionMode, label, icon: Icon }) => (
          // Base UI's menu items fire onClick, not Radix's onSelect — onSelect silently no-ops here.
          <DropdownMenuItem key={optionMode} onClick={() => choose(optionMode)}>
            <Icon className="size-4" />
            {label}
            {mode === optionMode && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
