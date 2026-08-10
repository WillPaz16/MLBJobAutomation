import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Discovery" },
  { to: "/pipeline", label: "Pipeline" },
  { to: "/documents", label: "Documents" },
  { to: "/analytics", label: "Analytics" },
];

export function Nav() {
  return (
    <nav className="flex gap-1 border-b border-gray-200 px-6 py-3 dark:border-gray-800">
      <span className="mr-6 font-semibold text-gray-900 dark:text-gray-100">Job Pipeline</span>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-sm font-medium ${
              isActive
                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
