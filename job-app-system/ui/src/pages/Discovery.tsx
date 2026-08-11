import { useEffect, useState } from "react";
import { AlertTriangle, CircleAlert, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Posting, PostingCategory } from "../api/types";
import { htmlToPlainText } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/labels";
import { Pagination } from "@/components/Pagination";
import { NotificationBanner } from "@/components/NotificationBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const STATUSES: { value: "active" | "closed" | "all"; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "closed", label: "Closed only" },
  { value: "all", label: "All statuses" },
];

type SortOption = "discoveredAt_desc" | "discoveredAt_asc" | "postedAt_desc" | "postedAt_asc" | "fit_desc";

const SORTS: { value: SortOption; label: string }[] = [
  { value: "discoveredAt_desc", label: "Newest found first" },
  { value: "discoveredAt_asc", label: "Oldest found first" },
  { value: "postedAt_desc", label: "Newest posted first" },
  { value: "postedAt_asc", label: "Oldest posted first" },
  { value: "fit_desc", label: "Best fit first" },
];

// Fit badge tiering — reuses the existing amber-badge convention (closed/possible-duplicate)
// for the middle tier rather than inventing a new palette.
function fitBadgeClassName(score: number): string {
  if (score >= 70) {
    return "gap-1 border-green-500/40 text-green-700 dark:text-green-400";
  }
  if (score >= 40) {
    return "gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400";
  }
  return "gap-1 text-muted-foreground";
}

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
  const [organization, setOrganization] = useState("all");
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [status, setStatus] = useState<"active" | "closed" | "all">("active");
  const [sort, setSort] = useState<SortOption>("discoveredAt_desc");
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [showDismissed, setShowDismissed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
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
      const { postings: data, total: newTotal } = await api.postings.list({
        category: category === "all" ? undefined : category,
        location: debouncedLocation || undefined,
        q: debouncedSearch || undefined,
        organization: organization === "all" ? undefined : organization,
        status,
        sort,
        hideDuplicates,
        showDismissed,
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
      setPostings(data);
      setTotal(newTotal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load postings");
    } finally {
      setLoading(false);
    }
  }

  // Any filter (or page size) change invalidates the current page — reset before the fetch effect
  // below re-runs, so a filter change never leaves the user stranded on an out-of-range page.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, debouncedLocation, debouncedSearch, organization, status, sort, hideDuplicates, showDismissed, pageSize]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, debouncedLocation, debouncedSearch, organization, status, sort, hideDuplicates, showDismissed, page, pageSize]);

  useEffect(() => {
    api.postings
      .organizations()
      .then(setOrganizations)
      .catch(() => {
        // silently skip — the organization filter just stays empty if this fails
      });
  }, []);

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

  async function dismiss(id: string) {
    try {
      await api.postings.update(id, { dismissedAt: new Date().toISOString() });
      toast.success("Dismissed", {
        action: { label: "Undo", onClick: () => undismiss(id) },
      });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss posting");
    }
  }

  async function undismiss(id: string) {
    try {
      await api.postings.update(id, { dismissedAt: null });
      toast.success("Restored");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore posting");
    }
  }

  async function rejectDuplicate(id: string) {
    try {
      const updated = await api.postings.update(id, { duplicateRejected: true });
      toast.success("Kept as a separate posting");
      setDetailPosting(updated);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update posting");
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
      <NotificationBanner />
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
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Team / Company</label>
          <Select value={organization} onValueChange={(v) => setOrganization(v ?? "all")}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams / companies</SelectItem>
              {organizations.map((org) => (
                <SelectItem key={org} value={org}>
                  {org}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
          <Select value={status} onValueChange={(v) => setStatus((v as typeof status) ?? "active")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Sort</label>
          <Select value={sort} onValueChange={(v) => setSort((v as typeof sort) ?? "discoveredAt_desc")}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1.5 pb-2">
          <Checkbox
            id="hide-duplicates"
            checked={hideDuplicates}
            onCheckedChange={(checked) => setHideDuplicates(checked === true)}
          />
          <label htmlFor="hide-duplicates" className="text-xs font-medium text-muted-foreground">
            Hide flagged duplicates
          </label>
        </div>
        <div className="flex items-center gap-1.5 pb-2">
          <Checkbox
            id="show-dismissed"
            checked={showDismissed}
            onCheckedChange={(checked) => setShowDismissed(checked === true)}
          />
          <label htmlFor="show-dismissed" className="text-xs font-medium text-muted-foreground">
            Show dismissed
          </label>
        </div>
        <span className="ml-auto text-sm text-muted-foreground">
          {total === 0
            ? "0 matching"
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
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
            {bulkApproving ? "Approving…" : "Approve selected"}
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
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
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
                      <div className="flex items-center gap-1.5">
                        <button
                          className="text-left font-medium text-foreground hover:underline"
                          onClick={() => setDetailPosting(p)}
                        >
                          {p.title}
                        </button>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center text-muted-foreground hover:text-primary"
                          aria-label={`Open original posting for ${p.title}`}
                          title="Open original posting"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {p.organization} · {p.location ?? "location unknown"}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary">{CATEGORY_LABELS[p.category]}</Badge>
                  {p.fitScore != null && (
                    <Tooltip>
                      <TooltipTrigger render={<span className="inline-flex" />}>
                        <Badge variant="outline" className={fitBadgeClassName(p.fitScore)}>
                          {p.fitScore}% fit
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        {p.matchedSkills && p.matchedSkills.length > 0
                          ? `Matched skills: ${p.matchedSkills.join(", ")}`
                          : "No skills matched your compatibility profile"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {p.dismissedAt && <Badge variant="outline">Dismissed</Badge>}
                  {p.closedAt && (
                    <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      Closed
                    </Badge>
                  )}
                  {p.possibleDuplicateOfId && !p.duplicateRejected && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            onClick={() => setDetailPosting(p.possibleDuplicateOf ?? p)}
                            className="inline-flex"
                          />
                        }
                      >
                        <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400">
                          <CircleAlert className="h-3 w-3" />
                          Possible duplicate
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        Possibly the same as: {p.possibleDuplicateOf?.title ?? "another posting"} @{" "}
                        {p.possibleDuplicateOf?.organization ?? p.organization}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {p.applications.length === 0 ? (
                    <Button onClick={() => approve(p.id)} disabled={approvingIds.has(p.id)}>
                      {approvingIds.has(p.id) ? "Approving…" : "Approve to apply"}
                    </Button>
                  ) : (
                    <Badge variant="outline">In pipeline</Badge>
                  )}
                  {p.dismissedAt ? (
                    <Button variant="ghost" size="sm" onClick={() => undismiss(p.id)}>
                      Restore
                    </Button>
                  ) : (
                    p.applications.length === 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => dismiss(p.id)}
                        aria-label={`Dismiss ${p.title}`}
                        title="Not interested — dismiss"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && total > 0 && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / pageSize)}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      )}

      <Dialog open={!!detailPosting} onOpenChange={(open) => !open && setDetailPosting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detailPosting?.title}</DialogTitle>
            <DialogDescription>
              {detailPosting?.organization} · {detailPosting?.location ?? "location unknown"}
            </DialogDescription>
          </DialogHeader>
          {detailPosting?.closedAt && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              This posting no longer appeared in the last {detailPosting.missedRuns} scrape(s) and is
              considered closed.
            </div>
          )}
          {detailPosting?.possibleDuplicateOfId && !detailPosting.duplicateRejected && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
              <span>
                Possibly the same as: <strong>{detailPosting.possibleDuplicateOf?.title ?? "another posting"}</strong>
              </span>
              <Button size="sm" variant="outline" onClick={() => rejectDuplicate(detailPosting.id)}>
                Not a duplicate — keep separate
              </Button>
            </div>
          )}
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm text-foreground">
            {detailPosting?.description
              ? htmlToPlainText(detailPosting.description)
              : "No description was captured for this posting."}
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
