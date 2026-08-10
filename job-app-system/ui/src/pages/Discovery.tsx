import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Posting, PostingCategory } from "../api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CATEGORIES: { value: PostingCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "BASEBALL_OPS", label: "Baseball Ops" },
  { value: "BASEBALL_ANALYTICS", label: "Baseball Analytics" },
  { value: "BASEBALL_RND", label: "Baseball R&D" },
  { value: "DATA_SCIENCE", label: "Data Science" },
  { value: "OTHER", label: "Other" },
];

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function Discovery() {
  const [postings, setPostings] = useState<Posting[]>([]);
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [detailPosting, setDetailPosting] = useState<Posting | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: "",
    organization: "",
    location: "",
    url: "",
    category: "OTHER" as PostingCategory,
  });
  const [savingManual, setSavingManual] = useState(false);

  const debouncedLocation = useDebounced(location, 300);
  const debouncedSearch = useDebounced(search, 300);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.postings.list({
        category: category === "all" ? undefined : category,
        location: debouncedLocation || undefined,
        q: debouncedSearch || undefined,
      });
      setPostings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load postings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, debouncedLocation, debouncedSearch]);

  const unreviewed = useMemo(() => postings.filter((p) => p.applications.length === 0), [postings]);

  async function approve(id: string) {
    setApprovingIds((prev) => new Set(prev).add(id));
    try {
      await api.postings.approve(id);
      toast.success("Application added to pipeline");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve posting");
    } finally {
      setApprovingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function approveSelected() {
    setBulkApproving(true);
    const ids = Array.from(selected);
    let succeeded = 0;
    for (const id of ids) {
      try {
        await api.postings.approve(id);
        succeeded++;
      } catch {
        // continue with the rest; report a partial-success summary below
      }
    }
    setBulkApproving(false);
    setSelected(new Set());
    if (succeeded === ids.length) {
      toast.success(`Approved ${succeeded} posting(s)`);
    } else {
      toast.warning(`Approved ${succeeded} of ${ids.length} posting(s) — some failed`);
    }
    await load();
  }

  async function createManualPosting() {
    if (!manualForm.title.trim() || !manualForm.organization.trim() || !manualForm.url.trim()) {
      toast.error("Title, organization, and URL are required");
      return;
    }
    setSavingManual(true);
    try {
      await api.postings.createManual({
        title: manualForm.title.trim(),
        organization: manualForm.organization.trim(),
        location: manualForm.location.trim() || undefined,
        url: manualForm.url.trim(),
        category: manualForm.category,
      });
      toast.success("Posting added");
      setManualOpen(false);
      setManualForm({ title: "", organization: "", location: "", url: "", category: "OTHER" });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add posting");
    } finally {
      setSavingManual(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Category</label>
          <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Location contains</label>
          <Input
            className="w-48"
            placeholder="e.g. Chicago, Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Search title/org</label>
          <Input
            className="w-56"
            placeholder="e.g. analytics, Cubs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {unreviewed.length} awaiting review of {postings.length} total
        </span>
        <Dialog open={manualOpen} onOpenChange={setManualOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>Add posting manually</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add posting manually</DialogTitle>
              <DialogDescription>
                For orgs with no scrapable source (e.g. Teamwork-Online-only teams) — check
                manually, then paste what you find here.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="mb-1">Title</Label>
                <Input
                  value={manualForm.title}
                  onChange={(e) => setManualForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Baseball Operations Fellow"
                />
              </div>
              <div>
                <Label className="mb-1">Organization</Label>
                <Input
                  value={manualForm.organization}
                  onChange={(e) => setManualForm((f) => ({ ...f, organization: e.target.value }))}
                  placeholder="e.g. New York Yankees"
                />
              </div>
              <div>
                <Label className="mb-1">Location</Label>
                <Input
                  value={manualForm.location}
                  onChange={(e) => setManualForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Bronx, NY"
                />
              </div>
              <div>
                <Label className="mb-1">URL</Label>
                <Input
                  value={manualForm.url}
                  onChange={(e) => setManualForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
              <div>
                <Label className="mb-1">Category</Label>
                <Select
                  value={manualForm.category}
                  onValueChange={(v) => setManualForm((f) => ({ ...f, category: (v as PostingCategory) ?? "OTHER" }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter((c) => c.value !== "all").map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={createManualPosting} disabled={savingManual}>
                {savingManual ? "Adding…" : "Add posting"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-md border bg-accent/40 px-3 py-2">
          <span className="text-sm">{selected.size} selected</span>
          <Button size="sm" onClick={approveSelected} disabled={bulkApproving}>
            {bulkApproving ? "Approving…" : "Approve Selected"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load postings: {error}{" "}
          <button className="underline" onClick={load}>
            Retry
          </button>
        </div>
      ) : postings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No postings yet. Run the discovery scraper (<code>npm run run-discovery</code> in{" "}
          <code>scrapers/</code>) to populate this feed.
        </p>
      ) : (
        <div className="grid gap-3">
          {postings.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="flex items-start gap-3">
                {p.applications.length === 0 && (
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggleSelected(p.id)}
                    className="mt-1"
                    aria-label={`Select ${p.title}`}
                  />
                )}
                <div>
                  <button
                    className="text-left font-medium text-foreground hover:underline"
                    onClick={() => setDetailPosting(p)}
                  >
                    {p.title}
                  </button>
                  <div className="text-sm text-muted-foreground">
                    {p.organization} · {p.location ?? "location unknown"}
                  </div>
                  <Badge variant="secondary" className="mt-1">
                    {p.category.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
              {p.applications.length === 0 ? (
                <Button onClick={() => approve(p.id)} disabled={approvingIds.has(p.id)}>
                  {approvingIds.has(p.id) ? "Approving…" : "Approve to Apply"}
                </Button>
              ) : (
                <Badge variant="outline">In pipeline</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!detailPosting} onOpenChange={(open) => !open && setDetailPosting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailPosting?.title}</DialogTitle>
            <DialogDescription>
              {detailPosting?.organization} · {detailPosting?.location ?? "location unknown"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">
            {detailPosting?.description || "No description was captured for this posting."}
          </div>
          {detailPosting && (
            <a
              href={detailPosting.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              View original posting
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
