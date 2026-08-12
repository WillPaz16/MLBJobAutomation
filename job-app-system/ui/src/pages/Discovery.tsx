import { useEffect, useState } from "react";
import { AlertTriangle, CircleAlert, ExternalLink, Info, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Application, Posting, PostingCategory } from "../api/types";
import { htmlToPlainText, snippet } from "@/lib/utils";
import {
  CATEGORY_FILTER_OPTIONS,
  CATEGORY_LABELS,
  REGION_FILTER_OPTIONS,
  REGION_LABELS,
  SENIORITY_FILTER_OPTIONS,
  SENIORITY_LABELS,
  WORK_MODE_FILTER_OPTIONS,
  WORK_MODE_LABELS,
} from "@/lib/labels";
import { useFilterParams } from "@/hooks/useFilterParams";
import { Pagination } from "@/components/Pagination";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { PageLayout, PageHeader } from "@/components/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STATUSES: { value: "active" | "closed" | "all"; label: string }[] = [
  { value: "active", label: "Active only" },
  { value: "closed", label: "Closed only" },
  { value: "all", label: "All statuses" },
];

type SortOption = "discoveredAt_desc" | "discoveredAt_asc" | "postedAt_desc" | "postedAt_asc" | "fit_desc";

const SORTS: { value: SortOption; label: string }[] = [
  { value: "fit_desc", label: "Best fit first" },
  { value: "discoveredAt_desc", label: "Newest found first" },
  { value: "discoveredAt_asc", label: "Oldest found first" },
  { value: "postedAt_desc", label: "Newest posted first" },
  { value: "postedAt_asc", label: "Oldest posted first" },
];

// Thresholds match api/src/fitScore.ts's fitTier boundaries exactly (Strong>=65, Good>=40,
// Fair>=20, Weak<20) — the "or better" floor for each preset is that tier's own lower bound.
const MIN_FIT_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Any fit" },
  { value: "20", label: "Fair or better" },
  { value: "40", label: "Good or better" },
  { value: "65", label: "Strong only" },
];

// Tier-based styling replaces the old numeric-threshold badge coloring now that the API returns
// `fitTier` (Phase 2) — Strong/Good map to the same green/amber classes the app already used,
// Fair/Weak fall back to muted rather than inventing a third color.
function fitBadgeClassName(tier: string | null | undefined): string {
  if (tier === "Strong") return "gap-1 border-green-500/40 text-green-700 dark:text-green-400";
  if (tier === "Good") return "gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400";
  return "gap-1 text-muted-foreground";
}

const FILTER_DEFAULTS: Record<string, string> = {
  category: "all",
  location: "",
  search: "",
  organization: "all",
  status: "active",
  sort: "fit_desc",
  hideDuplicates: "true",
  showDismissed: "false",
  pageSize: "25",
  seniority: "all",
  workMode: "all",
  region: "all",
  minFit: "none",
};

const FILTER_CHIP_LABELS: Record<string, (value: string) => string> = {
  category: (v) => `Category: ${CATEGORY_LABELS[v as PostingCategory] ?? v}`,
  location: (v) => `Location: ${v}`,
  search: (v) => `Search: ${v}`,
  organization: (v) => `Team/Company: ${v}`,
  status: (v) => `Status: ${STATUSES.find((s) => s.value === v)?.label ?? v}`,
  sort: (v) => `Sort: ${SORTS.find((s) => s.value === v)?.label ?? v}`,
  hideDuplicates: () => "Hide flagged duplicates: off",
  showDismissed: () => "Show dismissed: on",
  pageSize: (v) => `Rows per page: ${v}`,
  seniority: (v) => `Level: ${SENIORITY_LABELS[v] ?? v}`,
  workMode: (v) => `Work mode: ${WORK_MODE_LABELS[v] ?? v}`,
  region: (v) => `Region: ${REGION_LABELS[v] ?? v}`,
  minFit: (v) => `Fit: ${MIN_FIT_OPTIONS.find((o) => o.value === v)?.label ?? v}`,
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// Bounded-concurrency batch runner — used by bulk approve so a 20-item selection doesn't open 20
// simultaneous sockets against the local Express+SQLite API.
async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onProgress: (done: number) => void
): Promise<{ item: T; result?: R; error?: unknown }[]> {
  const results: { item: T; result?: R; error?: unknown }[] = [];
  let done = 0;
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((item) => fn(item)));
    settled.forEach((outcome, idx) => {
      const item = batch[idx];
      if (outcome.status === "fulfilled") {
        results.push({ item, result: outcome.value });
      } else {
        results.push({ item, error: outcome.reason });
      }
      done++;
      onProgress(done);
    });
  }
  return results;
}

export function Discovery() {
  const { filters, setFilter, page, setPage, activeFilters, clearFilters } = useFilterParams(FILTER_DEFAULTS);

  const [postings, setPostings] = useState<Posting[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkDismissing, setBulkDismissing] = useState(false);
  const [bulkDismissProgress, setBulkDismissProgress] = useState<{ done: number; total: number } | null>(null);
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

  // Local input state gives immediate typing feedback; the debounced value is what actually gets
  // written into the URL (via setFilter's `replace: true` below), so typing doesn't spam browser
  // history with one entry per keystroke.
  const [locationInput, setLocationInput] = useState(filters.location);
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedLocation = useDebounced(locationInput, 300);
  const debouncedSearch = useDebounced(searchInput, 300);

  const pageSize = Number(filters.pageSize) || 25;

  useEffect(() => {
    setFilter("location", debouncedLocation, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation]);

  useEffect(() => {
    setFilter("search", debouncedSearch, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { postings: data, total: newTotal } = await api.postings.list({
        category: filters.category === "all" ? undefined : filters.category,
        location: filters.location || undefined,
        q: filters.search || undefined,
        organization: filters.organization === "all" ? undefined : filters.organization,
        status: filters.status as "active" | "closed" | "all",
        sort: filters.sort as SortOption,
        hideDuplicates: filters.hideDuplicates === "true",
        showDismissed: filters.showDismissed === "true",
        seniority: filters.seniority === "all" ? undefined : filters.seniority,
        workMode: filters.workMode === "all" ? undefined : filters.workMode,
        region: filters.region === "all" ? undefined : filters.region,
        minFit: filters.minFit === "none" ? undefined : Number(filters.minFit),
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

  // The single fetch effect — collapsed from two effects (one resetting page, one fetching) on a
  // shared 9-item dependency list with react-hooks/exhaustive-deps suppressed. Because setFilter
  // resets page to 1 in the same setSearchParams call that changes a filter, every filter or page
  // change is exactly one URL mutation, so keying off the URL's own string form fires exactly one
  // load() per change — no lint suppression needed.
  const searchKey = new URLSearchParams({ ...filters, page: String(page) }).toString();
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

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
      const application: Application = await api.postings.approve(id);
      toast.success("Application added to pipeline", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await api.applications.remove(application.id);
              toast.success("Undone");
              await load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to undo");
            }
          },
        },
      });
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

  async function approveIds(ids: string[]) {
    setBulkApproving(true);
    setBulkProgress({ done: 0, total: ids.length });
    const results = await runInBatches(
      ids,
      5,
      (id) => api.postings.approve(id),
      (done) => setBulkProgress({ done, total: ids.length })
    );
    setBulkApproving(false);
    setBulkProgress(null);
    setSelected(new Set());
    const failed = results.filter((r) => r.error).map((r) => r.item);
    const succeeded = ids.length - failed.length;
    if (failed.length === 0) {
      toast.success(`Approved ${succeeded} posting(s)`);
    } else {
      toast.warning(`Approved ${succeeded} of ${ids.length} — ${failed.length} failed`, {
        action: { label: "Retry failed", onClick: () => approveIds(failed) },
      });
    }
    await load();
  }

  async function approveSelected() {
    await approveIds(Array.from(selected));
  }

  async function dismissIds(ids: string[]) {
    setBulkDismissing(true);
    setBulkDismissProgress({ done: 0, total: ids.length });
    const dismissedAt = new Date().toISOString();
    const results = await runInBatches(
      ids,
      5,
      (id) => api.postings.update(id, { dismissedAt }),
      (done) => setBulkDismissProgress({ done, total: ids.length })
    );
    setBulkDismissing(false);
    setBulkDismissProgress(null);
    setSelected(new Set());
    const failed = results.filter((r) => r.error).map((r) => r.item);
    const succeeded = ids.filter((id) => !failed.includes(id));
    if (failed.length === 0) {
      toast.success(`Dismissed ${succeeded.length} posting(s)`, {
        action: { label: "Undo", onClick: () => undismissIds(succeeded) },
      });
    } else {
      toast.warning(`Dismissed ${succeeded.length} of ${ids.length} — ${failed.length} failed`, {
        action: { label: "Retry failed", onClick: () => dismissIds(failed) },
      });
    }
    await load();
  }

  async function undismissIds(ids: string[]) {
    try {
      await Promise.all(ids.map((id) => api.postings.update(id, { dismissedAt: null })));
      toast.success("Restored");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore postings");
    }
  }

  async function dismissSelected() {
    await dismissIds(Array.from(selected));
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

  const selectableIds = postings.filter((p) => p.applications.length === 0).map((p) => p.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const someSelected = selectableIds.some((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      }
      return new Set([...prev, ...selectableIds]);
    });
  }

  return (
    <PageLayout>
      <NotificationBanner />
      <PageHeader
        title="Discovery"
        description="Browse and triage newly found postings."
        count={{ value: total, noun: "postings" }}
        actions={
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
                      {CATEGORY_FILTER_OPTIONS.filter((c) => c.value !== "all").map((c) => (
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
        }
      />

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="filter-category" className="mb-1">
            Category
          </Label>
          <Select value={filters.category} onValueChange={(v) => setFilter("category", v ?? "all")}>
            <SelectTrigger id="filter-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_FILTER_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-seniority" className="mb-1">
            Level
          </Label>
          <Select value={filters.seniority} onValueChange={(v) => setFilter("seniority", v ?? "all")}>
            <SelectTrigger id="filter-seniority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENIORITY_FILTER_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-work-mode" className="mb-1">
            Work mode
          </Label>
          <Select value={filters.workMode} onValueChange={(v) => setFilter("workMode", v ?? "all")}>
            <SelectTrigger id="filter-work-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WORK_MODE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-region" className="mb-1">
            Region
          </Label>
          <Select value={filters.region} onValueChange={(v) => setFilter("region", v ?? "all")}>
            <SelectTrigger id="filter-region" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGION_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="filter-location" className="mb-1">
            Location contains
          </Label>
          <Input
            id="filter-location"
            className="w-full"
            placeholder="e.g. Chicago, Remote"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="filter-search" className="mb-1">
            Search title/org
          </Label>
          <Input
            id="filter-search"
            className="w-full"
            placeholder="e.g. analytics, Cubs"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="filter-organization" className="mb-1">
            Team / Company
          </Label>
          <Select value={filters.organization} onValueChange={(v) => setFilter("organization", v ?? "all")}>
            <SelectTrigger id="filter-organization" className="w-full">
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
          <Label htmlFor="filter-status" className="mb-1">
            Status
          </Label>
          <Select value={filters.status} onValueChange={(v) => setFilter("status", v ?? "active")}>
            <SelectTrigger id="filter-status" className="w-full">
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
          <Label htmlFor="filter-sort" className="mb-1">
            Sort
          </Label>
          <Select value={filters.sort} onValueChange={(v) => setFilter("sort", v ?? "discoveredAt_desc")}>
            <SelectTrigger id="filter-sort" className="w-full">
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
        <div>
          <Label htmlFor="filter-min-fit" className="mb-1">
            Minimum fit
          </Label>
          <Select value={filters.minFit} onValueChange={(v) => setFilter("minFit", v ?? "none")}>
            <SelectTrigger id="filter-min-fit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MIN_FIT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Options
            </PopoverTrigger>
            <PopoverContent>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="hide-duplicates"
                  checked={filters.hideDuplicates === "true"}
                  onCheckedChange={(checked) => setFilter("hideDuplicates", checked === true ? "true" : "false")}
                />
                <Label htmlFor="hide-duplicates" className="text-xs font-medium text-muted-foreground">
                  Hide flagged duplicates
                </Label>
              </div>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="show-dismissed"
                  checked={filters.showDismissed === "true"}
                  onCheckedChange={(checked) => setFilter("showDismissed", checked === true ? "true" : "false")}
                />
                <Label htmlFor="show-dismissed" className="text-xs font-medium text-muted-foreground">
                  Show dismissed
                </Label>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {activeFilters.map(({ key, value }) => (
            <Badge key={key} variant="secondary" className="gap-1 pr-1">
              {FILTER_CHIP_LABELS[key]?.(value) ?? `${key}: ${value}`}
              <button
                type="button"
                onClick={() => {
                  setLocationInput((prev) => (key === "location" ? "" : prev));
                  setSearchInput((prev) => (key === "search" ? "" : prev));
                  setFilter(key, FILTER_DEFAULTS[key as keyof typeof FILTER_DEFAULTS]);
                }}
                aria-label={`Clear ${key} filter`}
                className="inline-flex rounded-full hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLocationInput("");
              setSearchInput("");
              clearFilters();
            }}
          >
            Clear all
          </Button>
        </div>
      )}

      {postings.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={toggleSelectAll}
            disabled={selectableIds.length === 0}
            aria-label="Select all visible postings"
          />
          <span className="text-sm text-muted-foreground">Select all visible</span>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm">{selected.size} selected</span>
          <Button size="sm" onClick={approveSelected} disabled={bulkApproving || bulkDismissing}>
            {bulkApproving && bulkProgress
              ? `Approving ${bulkProgress.done}/${bulkProgress.total}…`
              : "Approve selected"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={dismissSelected}
            disabled={bulkApproving || bulkDismissing}
          >
            {bulkDismissing && bulkDismissProgress
              ? `Dismissing ${bulkDismissProgress.done}/${bulkDismissProgress.total}…`
              : "Dismiss selected"}
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
        <ErrorState title="Failed to load postings" error={error} onRetry={load} />
      ) : postings.length === 0 ? (
        activeFilters.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No postings yet"
            description="Run the discovery scraper (npm run run-discovery in scrapers/) to populate this feed."
            variant="empty"
          />
        ) : (
          <EmptyState
            icon={Search}
            title="No postings match your filters"
            description="Try loosening a filter or clear them all to see the full feed."
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLocationInput("");
                  setSearchInput("");
                  clearFilters();
                }}
              >
                Clear all filters
              </Button>
            }
            variant="no-matches"
          />
        )
      ) : (
        <div className="grid gap-3">
          {postings.map((p) => {
            const overflowSkills = (p.matchedSkills ?? []).slice(4);
            return (
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
                          {p.salary && (
                            <>
                              {" · "}
                              <Badge variant="outline" className="text-xs font-normal">
                                {p.salary}
                              </Badge>
                            </>
                          )}
                        </div>
                        {p.description && (
                          <p className="mt-1 line-clamp-2 max-w-2xl text-sm text-muted-foreground">
                            {snippet(p.description, 200)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{CATEGORY_LABELS[p.category]}</Badge>
                    {p.seniority && <Badge variant="secondary">{SENIORITY_LABELS[p.seniority] ?? p.seniority}</Badge>}
                    {p.workMode && <Badge variant="secondary">{WORK_MODE_LABELS[p.workMode] ?? p.workMode}</Badge>}
                    {p.region && <Badge variant="secondary">{REGION_LABELS[p.region] ?? p.region}</Badge>}
                    {p.fitScore != null && (
                      <Tooltip>
                        <TooltipTrigger render={<button type="button" />}>
                          <Badge variant="outline" className={fitBadgeClassName(p.fitTier)}>
                            {p.fitTier ? `${p.fitTier} fit · ` : ""}
                            {p.fitScore}%
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          {p.reasons && p.reasons.length > 0
                            ? p.reasons
                                .map((r) => `${r.label} (${r.points >= 0 ? "+" : ""}${r.points})`)
                                .join(" · ")
                            : p.matchedSkills && p.matchedSkills.length > 0
                              ? `Matched skills: ${p.matchedSkills.join(", ")}`
                              : "No skills matched your compatibility profile"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(p.matchedSkills ?? []).slice(0, 4).map((skill) => (
                      <Badge key={skill} variant="outline" className="text-xs font-normal">
                        {skill}
                      </Badge>
                    ))}
                    {overflowSkills.length > 0 && (
                      <Badge variant="outline" className="text-xs font-normal">
                        +{overflowSkills.length}
                      </Badge>
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
            );
          })}
        </div>
      )}

      {!loading && !error && total > 0 && (
        <Pagination
          page={page}
          totalPages={Math.ceil(total / pageSize)}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(size) => setFilter("pageSize", String(size))}
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
          {detailPosting?.reasons && detailPosting.reasons.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2.5 text-sm">
              <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                <Info className="h-3.5 w-3.5" />
                Why this fit score
              </div>
              <ul className="space-y-0.5 text-muted-foreground">
                {detailPosting.reasons.map((r, i) => (
                  <li key={i}>
                    {r.label} <span className="tabular-nums">{r.points >= 0 ? "+" : ""}{r.points}</span>
                  </li>
                ))}
              </ul>
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
    </PageLayout>
  );
}
