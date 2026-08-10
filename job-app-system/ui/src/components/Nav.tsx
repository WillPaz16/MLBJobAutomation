import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/", label: "Discovery" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/documents", label: "Documents" },
  { to: "/analytics", label: "Analytics" },
];

function linkClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
  }`;
}

export function Nav() {
  return (
    <nav className="flex items-center gap-1 border-b px-6 py-3">
      <span className="mr-6 font-semibold text-foreground">Job Pipeline</span>

      <div className="hidden gap-1 sm:flex">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className={linkClass}>
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="ml-auto sm:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Open navigation menu" />}>
            <Menu className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {links.map((link) => (
              <DropdownMenuItem key={link.to} render={<NavLink to={link.to} />}>
                {link.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
