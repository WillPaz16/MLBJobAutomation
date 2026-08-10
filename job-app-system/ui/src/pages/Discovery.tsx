import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Posting, PostingCategory } from "../api/types";

const CATEGORIES: { value: PostingCategory | ""; label: string }[] = [
  { value: "", label: "All categories" },
  { value: "BASEBALL_OPS", label: "Baseball Ops" },
  { value: "BASEBALL_ANALYTICS", label: "Baseball Analytics" },
  { value: "BASEBALL_RND", label: "Baseball R&D" },
  { value: "DATA_SCIENCE", label: "Data Science" },
  { value: "OTHER", label: "Other" },
];

export function Discovery() {
  const [postings, setPostings] = useState<Posting[]>([]);
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.postings.list({
        category: category || undefined,
        location: location || undefined,
      });
      setPostings(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, location]);

  const unreviewed = useMemo(() => postings.filter((p) => p.applications.length === 0), [postings]);

  async function approve(id: string) {
    setApprovingId(id);
    try {
      await api.postings.approve(id);
      await load();
    } finally {
      setApprovingId(null);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
          <select
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Location contains</label>
          <input
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            placeholder="e.g. Chicago, Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <span className="ml-auto text-sm text-gray-500">
          {unreviewed.length} awaiting review of {postings.length} total
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : postings.length === 0 ? (
        <p className="text-sm text-gray-500">
          No postings yet. Run the discovery scraper (<code>npm run run-discovery</code> in{" "}
          <code>scrapers/</code>) to populate this feed.
        </p>
      ) : (
        <div className="grid gap-3">
          {postings.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <div>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-gray-900 hover:underline dark:text-gray-100"
                >
                  {p.title}
                </a>
                <div className="text-sm text-gray-500">
                  {p.organization} · {p.location ?? "location unknown"} · {p.category.replace(/_/g, " ")}
                </div>
              </div>
              {p.applications.length === 0 ? (
                <button
                  onClick={() => approve(p.id)}
                  disabled={approvingId === p.id}
                  className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {approvingId === p.id ? "Approving…" : "Approve to Apply"}
                </button>
              ) : (
                <span className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  In pipeline
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
