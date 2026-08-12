import { BarChart3, ClipboardList, FileText, Home as HomeIcon, ListChecks, Menu, Search, Target } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";

const links = [
  { to: "/", label: "Home", end: true, icon: HomeIcon },
  { to: "/discovery", label: "Discovery", icon: Search },
  { to: "/pipeline", label: "Pipeline", icon: ListChecks },
  { to: "/prep", label: "Prep", icon: ClipboardList },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/compatibility", label: "Compatibility", icon: Target },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return `relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
    isActive ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

export function Nav() {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-40 flex items-center gap-1 border-b bg-background/80 px-6 py-3 shadow-elev-1 backdrop-blur">
      <span className="mr-6 font-semibold text-foreground">Job Pipeline</span>

      <div className="hidden gap-1 sm:flex">
        {links.map((link) => {
          const isActive = link.end ? location.pathname === link.to : location.pathname.startsWith(link.to);
          return (
            <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
              <link.icon className="size-4" />
              {link.label}
              {/* Animated active-state indicator: a 2px underline that transitions position via
                  a plain CSS transition (no layoutId/animation library) — present on every link
                  but only visible (scaled to full width) on the active one. */}
              <span
                className={`absolute inset-x-2 -bottom-[1px] h-0.5 rounded-full bg-primary transition-transform duration-200 ${
                  isActive ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </NavLink>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation menu" />}>
              <Menu className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {links.map((link) => (
                <DropdownMenuItem key={link.to} render={<NavLink to={link.to} end={link.end} />}>
                  <link.icon className="size-4" />
                  {link.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
