import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-2 p-16 text-center">
      <p className="text-lg font-medium text-foreground">Page not found</p>
      <Link to="/" className="text-sm text-primary underline">
        Back to Discovery
      </Link>
    </div>
  );
}
