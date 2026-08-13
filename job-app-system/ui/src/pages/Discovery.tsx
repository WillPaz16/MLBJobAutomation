import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  CircleAlert,
  ExternalLink,
  Info,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../api/client";
import type { Application, Posting, PostingCategory, SavedSearch } from "../api/types";
import { htmlToPlainText, snippet } from "@/lib/utils";
import {
  CATEGORY_FILTER_OPTIONS,
  CATEGORY_LABELS,
  DEFAULT_SORT,
  DISCOVERY_FILTER_NAMES,
  DISCOVERY_TAB_CATEGORY,
  DISCOVERY_TAB_LABELS,
  DISCOVERY_TAB_ORDER,
  DISCOVERY_TAB_SOURCE_SECTIONS,
  INTERNSHIP_FILTER_OPTIONS,
  MIN_FIT_LABELS,
  MIN_FIT_OPTIONS,
  RECENCY_LABELS,
  RECENCY_OPTIONS,
  REGION_FILTER_OPTIONS,
  REGION_LABELS,
  SENIORITY_FILTER_OPTIONS,
  SENIORITY_LABELS,
  SORT_LABELS,
  SORTS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUSES,
  WORK_MODE_FILTER_OPTIONS,
  WORK_MODE_LABELS,
  optionsToLabels,
  type DiscoveryTab,
  type DiscoverySortOption,
} from "@/lib/labels";
import { useFilterParams } from "@/hooks/useFilterParams";
import { useDebounced } from "@/hooks/useDebounced";
import { useEntrance } from "@/lib/useEntrance";
import { Pagination } from "@/components/Pagination";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { NotificationBanner } from "@/components/NotificationBanner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FilterField } from "@/components/FilterField";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CATEGORY_FILTER_LABELS = optionsToLabels(CATEGORY_FILTER_OPTIONS);
const SENIORITY_FILTER_LABELS = optionsToLabels(SENIORITY_FILTER_OPTIONS);
const WORK_MODE_FILTER_LABELS = optionsToLabels(WORK_MODE_FILTER_OPTIONS);
const REGION_FILTER_LABELS = optionsToLabels(REGION_FILTER_OPTIONS);
const INTERNSHIP_LABELS = optionsToLabels(INTERNSHIP_FILTER_OPTIONS);

// Tier-based styling replaces the old numeric-threshold badge coloring now that the API returns
// `fitTier` (Phase 2) — Strong/Good map to the same green/amber classes the app already used,
// Fair/Weak fall back to muted rather than inventing a third color.
function fitBadgeClassName(tier: string | null | undefined): string {
  if (tier === "Strong") return "gap-1 border-green-500/40 text-green-700 dark:text-green-400";
  if (tier === "Good") return "gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400";
  return "gap-1 text-muted-foreground";
}

// Row-B ("More filters") members — used both to build the disclosure count and to decide whether
// a hidden filter must force the section open on mount. Deliberately excludes Row A's own filters
// (search/discoveredAfter aka recency/minFit/sort) and the tab/pageSize params, which aren't part
// of either filter row.
const ROW_B_KEYS = [
  "category",
  "seniority",
  "isInternship",
  "matchedSkill",
  "location",
  "workMode",
  "region",
  "organization",
  "source",
  "status",
  "hideDuplicates",
  "showDismissed",
  "excludeInPipeline",
] as const;

const FILTER_DEFAULTS: Record<string, string> = {
  tab: "baseball",
  category: "all",
  location: "",
  search: "",
  organization: "all",
  status: "active",
  sort: DEFAULT_SORT,
  hideDuplicates: "true",
  showDismissed: "false",
  pageSize: "25",
  seniority: "all",
  workMode: "all",
  region: "all",
  minFit: "none",
  isInternship: "all",
  recency: "any",
  source: "all",
  excludeInPipeline: "false",
  matchedSkill: "all",
};

function chipValueLabel(key: string, value: string): string {
  switch (key) {
    case "category":
      return CATEGORY_LABELS[value as PostingCategory] ?? value;
    case "location":
      return value;
    case "search":
      return value;
    case "organization":
      return value;
    case "status":
      return STATUSES.find((s) => s.value === value)?.label ?? value;
    case "sort":
      return SORTS.find((s) => s.value === value)?.label ?? value;
    case "hideDuplicates":
      return "off";
    case "showDismissed":
      return "on";
    case "pageSize":
      return value;
    case "seniority":
      return SENIORITY_LABELS[value] ?? value;
    case "workMode":
      return WORK_MODE_LABELS[value] ?? value;
    case "region":
      return REGION_LABELS[value] ?? value;
    case "minFit":
      return MIN_FIT_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case "isInternship":
      return INTERNSHIP_FILTER_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case "recency":
      return RECENCY_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case "source":
      return SOURCE_LABELS[value] ?? value;
    case "excludeInPipeline":
      return "on";
    case "matchedSkill":
      return value;
    default:
      return value;
  }
}

// Every chip label is built from the same DISCOVERY_FILTER_NAMES map used for aria-labels below —
// this is the fix for the aria-label bug (it used to emit the raw camelCase key, e.g. "Clear
// isInternship filter") as well as the single source of truth for the visible chip text.
function chipLabel(key: string, value: string): string {
  const name = DISCOVERY_FILTER_NAMES[key] ?? key;
  return `${name}: ${chipValueLabel(key, value)}`;
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

const MORE_FILTERS_STORAGE_KEY = "discovery-more-filters-expanded";

export function Discovery() {
  const { filters, setFilter, page, setPage, activeFilters, clearFilters, applyQueryString, searchParams } =
    useFilterParams(FILTER_DEFAULTS);
  const entrance = useEntrance();

  const [postings, setPostings] = useState<Posting[]>([]);
  const [organizations, setOrganizations] = useState<string[]>([]);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [profileSkills, setProfileSkills] = useState<string[]>([]);
  const [tabCounts, setTabCounts] = useState<Record<DiscoveryTab, number>>({
    all: 0,
    baseball: 0,
    "ds-ai-ml": 0,
    quant: 0,
    pm: 0,
    "data-science": 0,
  });
  const [total, setTotal] = useState(0);
  const [fitCohortSize, setFitCohortSize] = useState<number | null>(null);
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
  // Derived once for both load() and render (e.g. hiding the redundant category filter below)
  // rather than recomputing the same "?? baseball" fallback in each place.
  const currentTab = (filters.tab as DiscoveryTab) ?? "baseball";

  // Extracted so every place that resets these two debounced text inputs (chip-clear, Clear all,
  // and applying a saved search) goes through one function — previously this reseed was
  // duplicated ad hoc at each call site.
  function resetTextInputs(nextSearch = "", nextLocation = "") {
    setSearchInput(nextSearch);
    setLocationInput(nextLocation);
  }

  useEffect(() => {
    setFilter("location", debouncedLocation, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedLocation]);

  useEffect(() => {
    setFilter("search", debouncedSearch, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // ---- More filters (Row B) disclosure ------------------------------------------------------
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(MORE_FILTERS_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const rowBForceCheckedRef = useRef(false);
  const rowBActiveCount = ROW_B_KEYS.filter((key) => filters[key] !== FILTER_DEFAULTS[key]).length;
  useEffect(() => {
    // A hidden active filter must never be invisible — force Row B open once on mount if any of
    // its filters is already non-default (e.g. arriving via a saved-search/shared URL). Only ever
    // forces OPEN, never closed, and only once — a ref guard (not a dependency-array trick) keeps
    // this from re-forcing itself back open every time the user deliberately collapses it later
    // while a Row-B filter happens to still be active.
    if (rowBForceCheckedRef.current) return;
    rowBForceCheckedRef.current = true;
    if (rowBActiveCount > 0) setExpanded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function toggleExpanded() {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MORE_FILTERS_STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable (e.g. private browsing) — the toggle still works for this
        // session, it just won't persist across reloads.
      }
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const tab = currentTab;
      const recencyDays = filters.recency !== "any" ? Number(filters.recency) : undefined;
      const discoveredAfter =
        recencyDays !== undefined && !Number.isNaN(recencyDays)
          ? new Date(Date.now() - recencyDays * 86_400_000).toISOString()
          : undefined;
      // The "data-science" tab fixes category to DATA_SCIENCE itself, overriding whatever the
      // in-tab category filter dropdown holds (that dropdown is hidden while this tab is active —
      // see the Row-B category FilterField below — so there's no way for the two to disagree in
      // practice, but the tab's own scoping takes precedence here regardless).
      const { postings: data, total: newTotal, fitCohortSize: cohortSize } = await api.postings.list({
        category: tab === "data-science" ? DISCOVERY_TAB_CATEGORY : filters.category === "all" ? undefined : filters.category,
        location: filters.location || undefined,
        q: filters.search || undefined,
        organization: filters.organization === "all" ? undefined : filters.organization,
        source: filters.source === "all" ? undefined : filters.source,
        status: filters.status as "active" | "closed" | "all",
        sort: filters.sort as DiscoverySortOption,
        hideDuplicates: filters.hideDuplicates === "true",
        showDismissed: filters.showDismissed === "true",
        seniority: filters.seniority === "all" ? undefined : filters.seniority,
        workMode: filters.workMode === "all" ? undefined : filters.workMode,
        region: filters.region === "all" ? undefined : filters.region,
        minFit: filters.minFit === "none" ? undefined : Number(filters.minFit),
        // Everything (tab=all) and data-science (tab=data-science, scoped by category alone
        // above): no isMlbTeam/sourceSection scoping at all. Baseball: isMlbTeam true. The other
        // three tabs: isMlbTeam false + their sourceSection value (isMlbTeam:false is redundant
        // with sourceSection in practice, but harmless and matches prior behavior).
        isMlbTeam: tab === "all" || tab === "data-science" ? undefined : tab === "baseball",
        sourceSection:
          tab === "baseball" || tab === "all" || tab === "data-science"
            ? undefined
            : DISCOVERY_TAB_SOURCE_SECTIONS[tab],
        isInternship: filters.isInternship === "all" ? undefined : filters.isInternship,
        discoveredAfter,
        excludeInPipeline: filters.excludeInPipeline === "true" ? true : undefined,
        matchedSkill: filters.matchedSkill === "all" ? undefined : filters.matchedSkill,
        take: pageSize,
        skip: (page - 1) * pageSize,
      });
      setPostings(data);
      setTotal(newTotal);
      setFitCohortSize(cohortSize);
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
    api.profile
      .get()
      .then((profile) => {
        if (!profile) return;
        const skills = [profile.coreSkills, profile.skills]
          .filter((v): v is string => Boolean(v))
          .join(",")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        setProfileSkills([...new Set(skills)]);
      })
      .catch(() => {
        // silently skip — matched-skill filter just stays empty if no profile exists
      });
  }, []);

  // Tab counts intentionally come from one mount-time facets() call, not re-derived from the
  // filtered `total` on every load() — like inbox unread-counts, they should stay stable while
  // triaging within a tab (category/seniority/search etc. changing shouldn't make the *other*
  // tabs' counts jump around).
  useEffect(() => {
    api.postings
      .facets()
      .then((facets) => {
        setTabCounts({
          all: facets.allActiveCount ?? 0,
          baseball: facets.mlbTeamCounts.true ?? 0,
          "ds-ai-ml": facets.sourceSectionCounts["Data Science, AI & Machine Learning"] ?? 0,
          quant: facets.sourceSectionCounts["Quantitative Finance"] ?? 0,
          pm: facets.sourceSectionCounts["Product Management"] ?? 0,
          "data-science": facets.categoryCounts?.DATA_SCIENCE ?? 0,
        });
        setSourceTypes(facets.sourceTypes ?? []);
      })
      .catch(() => {
        // silently skip — tab labels/source filter just show without counts/options if this fails
      });
  }, []);

  // ---- Saved searches (stored in the DB, not localStorage — see SavedSearch model) -----------
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [confirmDeleteSearch, setConfirmDeleteSearch] = useState<SavedSearch | null>(null);
  const defaultAppliedRef = useRef(false);

  function loadSavedSearches() {
    api.savedSearches
      .list()
      .then(setSavedSearches)
      .catch(() => {
        // silently skip — the Bookmark menu just shows no saved searches if this fails
      });
  }

  useEffect(() => {
    loadSavedSearches();
  }, []);

  // Default-view-on-load, guarded to fire exactly once via a ref (not a dependency-array trick):
  // without the guard, applying the default saved view would re-fire on every savedSearches
  // refetch (e.g. after saving/deleting one), and "Clear all" would look broken — clearing the
  // URL would instantly re-trigger the default view re-applying itself.
  useEffect(() => {
    if (defaultAppliedRef.current) return;
    if (savedSearches.length === 0) return;
    defaultAppliedRef.current = true;
    // Only auto-apply if the URL is otherwise at its defaults — arriving with an explicit
    // filter/shared-link URL should never be silently overridden by a saved default.
    if (activeFilters.length > 0) return;
    const defaultSearch = savedSearches.find((s) => s.isDefault);
    if (defaultSearch) applySavedSearch(defaultSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSearches]);

  // Applies a saved search's stored query string. The one real trap here (the "debounce clobber"):
  // locationInput/searchInput are local state feeding 300ms-debounced effects that eventually
  // overwrite the URL's location/search params — so applying a saved view while the box holds
  // different text would get silently overwritten 300ms later by the STALE input value. Reseeding
  // both inputs in the SAME commit as applying the filters (via applyQueryString, which replaces
  // every filter in one setSearchParams call) closes that gap.
  function applySavedSearch(saved: SavedSearch) {
    const params = new URLSearchParams(saved.query);
    resetTextInputs(params.get("search") ?? "", params.get("location") ?? "");
    applyQueryString(saved.query);
  }

  async function saveCurrentView() {
    if (!saveName.trim()) {
      toast.error("Name is required");
      return;
    }
    setSavingSearch(true);
    try {
      // searchParams already excludes "page" (useFilterParams never writes it for page<=1, and a
      // saved view shouldn't pin a page anyway) and only contains non-default values.
      const query = searchParams.toString();
      await api.savedSearches.create({ name: saveName.trim(), query, isDefault: saveAsDefault });
      toast.success("View saved");
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveAsDefault(false);
      loadSavedSearches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save view");
    } finally {
      setSavingSearch(false);
    }
  }

  async function setSearchDefault(saved: SavedSearch) {
    try {
      await api.savedSearches.update(saved.id, { isDefault: !saved.isDefault });
      loadSavedSearches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update saved view");
    }
  }

  async function deleteSavedSearch(saved: SavedSearch) {
    try {
      await api.savedSearches.remove(saved.id);
      toast.success("Saved view deleted");
      loadSavedSearches();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete saved view");
    }
  }

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

  function clearAll() {
    resetTextInputs();
    clearFilters();
  }

  const sourceFilterLabels: Record<string, string> = optionsToLabels(
    sourceTypes.map((t) => ({ value: t, label: SOURCE_LABELS[t] ?? t }))
  );

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
                      <SelectValue labels={CATEGORY_FILTER_LABELS} />
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

      <Tabs
        value={filters.tab}
        onValueChange={(v) => setFilter("tab", (v as string) ?? "baseball")}
        className="mb-1"
      >
        <TabsList variant="line">
          {DISCOVERY_TAB_ORDER.map((t) => (
            <TabsTrigger key={t} value={t}>
              {DISCOVERY_TAB_LABELS[t]} · {tabCounts[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* fitScore is a percentile WITHIN the current tab's cohort, not an absolute claim — the
          same posting can rank differently in Everything vs. its own tab, so this stays visible
          rather than only surfacing in a tooltip. */}
      <p className="mb-3 text-xs text-muted-foreground">
        Fit is ranked within the current tab
        {fitCohortSize != null && ` (against ${fitCohortSize.toLocaleString()} posting${fitCohortSize === 1 ? "" : "s"} in this view)`}.
      </p>

      {/* Row A — always visible: Search, Discovered, Minimum fit, Sort, More filters disclosure. */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FilterField id="filter-search" label={DISCOVERY_FILTER_NAMES.search}>
          <Input
            id="filter-search"
            className="w-full"
            placeholder="e.g. analytics, Cubs, -intern"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </FilterField>
        <FilterField id="filter-recency" label={DISCOVERY_FILTER_NAMES.discoveredAfter}>
          <Select value={filters.recency} onValueChange={(v) => setFilter("recency", v ?? "any")}>
            <SelectTrigger id="filter-recency" className="w-full">
              <SelectValue labels={RECENCY_LABELS} />
            </SelectTrigger>
            <SelectContent>
              {RECENCY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField
          id="filter-min-fit"
          label={
            <span className="inline-flex items-center gap-1">
              {DISCOVERY_FILTER_NAMES.minFit}
              <Tooltip>
                <TooltipTrigger render={<button type="button" aria-label="About fit ranking" />}>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  Fit is a percentile rank against the postings currently in view
                  {fitCohortSize != null ? ` (${fitCohortSize.toLocaleString()} postings)` : ""} — the same
                  posting can score differently in a different tab.
                </TooltipContent>
              </Tooltip>
            </span>
          }
        >
          <Select value={filters.minFit} onValueChange={(v) => setFilter("minFit", v ?? "none")}>
            <SelectTrigger id="filter-min-fit" className="w-full">
              <SelectValue labels={MIN_FIT_LABELS} />
            </SelectTrigger>
            <SelectContent>
              {MIN_FIT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField id="filter-sort" label={DISCOVERY_FILTER_NAMES.sort}>
          <Select value={filters.sort} onValueChange={(v) => setFilter("sort", v ?? DEFAULT_SORT)}>
            <SelectTrigger id="filter-sort" className="w-full">
              <SelectValue labels={SORT_LABELS} />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <div>
          {/* Invisible-but-present Label restores baseline alignment with the other four cells
              (each of which has a real Label above its control). */}
          <Label className="mb-1 invisible">More filters</Label>
          <Button variant="outline" className="h-8 w-full" onClick={toggleExpanded}>
            More filters{rowBActiveCount > 0 ? ` · ${rowBActiveCount}` : ""}
          </Button>
        </div>
      </div>

      {/* Row B — collapsed by default, three semantic groups. Force-expanded on mount above if any
          of its own filters was already non-default. The old Options popover is gone entirely. */}
      {expanded && (
        <div className="mb-3 grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-3 lg:grid-cols-3">
          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What</legend>
            {/* Hidden while the data-science tab is active — that tab already fixes category to
                DATA_SCIENCE itself (see load() above), so showing this dropdown would be
                redundant at best and, if changed, would silently contradict the tab's own point. */}
            {currentTab !== "data-science" && (
              <FilterField id="filter-category" label={DISCOVERY_FILTER_NAMES.category}>
                <Select value={filters.category} onValueChange={(v) => setFilter("category", v ?? "all")}>
                  <SelectTrigger id="filter-category" className="w-full">
                    <SelectValue labels={CATEGORY_FILTER_LABELS} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_FILTER_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            )}
            <FilterField id="filter-seniority" label={DISCOVERY_FILTER_NAMES.seniority}>
              <Select value={filters.seniority} onValueChange={(v) => setFilter("seniority", v ?? "all")}>
                <SelectTrigger id="filter-seniority" className="w-full">
                  <SelectValue labels={SENIORITY_FILTER_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {SENIORITY_FILTER_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="filter-internship" label={DISCOVERY_FILTER_NAMES.isInternship}>
              <Select value={filters.isInternship} onValueChange={(v) => setFilter("isInternship", v ?? "all")}>
                <SelectTrigger id="filter-internship" className="w-full">
                  <SelectValue labels={INTERNSHIP_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {INTERNSHIP_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="filter-matched-skill" label={DISCOVERY_FILTER_NAMES.matchedSkill}>
              <Select value={filters.matchedSkill} onValueChange={(v) => setFilter("matchedSkill", v ?? "all")}>
                <SelectTrigger id="filter-matched-skill" className="w-full">
                  <SelectValue>{(v: string) => (v === "all" ? "Any skill" : v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any skill</SelectItem>
                  {profileSkills.map((skill) => (
                    <SelectItem key={skill} value={skill}>
                      {skill}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</legend>
            <FilterField id="filter-location" label={DISCOVERY_FILTER_NAMES.location}>
              <Input
                id="filter-location"
                className="w-full"
                placeholder="e.g. Chicago, Remote"
                value={locationInput}
                onChange={(e) => setLocationInput(e.target.value)}
              />
            </FilterField>
            <FilterField id="filter-work-mode" label={DISCOVERY_FILTER_NAMES.workMode}>
              <Select value={filters.workMode} onValueChange={(v) => setFilter("workMode", v ?? "all")}>
                <SelectTrigger id="filter-work-mode" className="w-full">
                  <SelectValue labels={WORK_MODE_FILTER_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {WORK_MODE_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="filter-region" label={DISCOVERY_FILTER_NAMES.region}>
              <Select value={filters.region} onValueChange={(v) => setFilter("region", v ?? "all")}>
                <SelectTrigger id="filter-region" className="w-full">
                  <SelectValue labels={REGION_FILTER_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {REGION_FILTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="filter-organization" label={DISCOVERY_FILTER_NAMES.organization}>
              <Select value={filters.organization} onValueChange={(v) => setFilter("organization", v ?? "all")}>
                <SelectTrigger id="filter-organization" className="w-full">
                  {/* Free-text org names get explicit children — titleCase would mangle
                      "MLB Network" into "Mlb Network", so this is one of the two documented
                      exceptions to the labels= pattern. */}
                  <SelectValue>{(v: string) => (v === "all" ? "All teams / companies" : v)}</SelectValue>
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
            </FilterField>
          </fieldset>

          <fieldset className="space-y-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source &amp; state
            </legend>
            <FilterField id="filter-source" label={DISCOVERY_FILTER_NAMES.source}>
              <Select value={filters.source} onValueChange={(v) => setFilter("source", v ?? "all")}>
                <SelectTrigger id="filter-source" className="w-full">
                  <SelectValue labels={sourceFilterLabels}>
                    {(v: string) => (v === "all" ? "All platforms" : sourceFilterLabels[v] ?? v)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {sourceTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {SOURCE_LABELS[type] ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="filter-status" label={DISCOVERY_FILTER_NAMES.status}>
              <Select value={filters.status} onValueChange={(v) => setFilter("status", v ?? "active")}>
                <SelectTrigger id="filter-status" className="w-full">
                  <SelectValue labels={STATUS_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
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
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="exclude-in-pipeline"
                checked={filters.excludeInPipeline === "true"}
                onCheckedChange={(checked) => setFilter("excludeInPipeline", checked === true ? "true" : "false")}
              />
              <Label htmlFor="exclude-in-pipeline" className="text-xs font-medium text-muted-foreground">
                Hide postings already in my pipeline
              </Label>
            </div>
          </fieldset>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {activeFilters
          .filter(({ key }) => key !== "tab")
          .map(({ key, value }) => (
            <Badge key={key} variant="secondary" className="gap-1 pr-1">
              {chipLabel(key, value)}
              <button
                type="button"
                onClick={() => {
                  setLocationInput((prev) => (key === "location" ? "" : prev));
                  setSearchInput((prev) => (key === "search" ? "" : prev));
                  setFilter(key, FILTER_DEFAULTS[key as keyof typeof FILTER_DEFAULTS]);
                }}
                aria-label={`Clear filter: ${chipLabel(key, value)}`}
                className="inline-flex rounded-full hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        {activeFilters.filter((f) => f.key !== "tab").length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            Clear all
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <Bookmark className="h-3.5 w-3.5" />
            Saved searches
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>Save current view…</DropdownMenuItem>
            {savedSearches.length > 0 && <DropdownMenuSeparator />}
            {/* Each saved search gets three SEPARATE top-level menu items (apply/default/delete)
                instead of nesting the star/delete buttons inside one DropdownMenuItem — Base UI's
                menu arrow-key navigation only moves between top-level items and can't reach
                interactive elements nested inside another interactive element (invalid HTML besides
                being mouse-only). Splitting them out keeps every action individually reachable via
                the menu's normal keyboard flow with no nesting. */}
            {savedSearches.map((saved, i) => (
              <div key={saved.id}>
                {i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem onClick={() => applySavedSearch(saved)} className="gap-1.5">
                  {saved.isDefault && <Star className="h-3 w-3 shrink-0 fill-current text-amber-500" />}
                  <span className="truncate">Apply "{saved.name}"</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSearchDefault(saved)} className="gap-1.5 pl-6">
                  <Star className={`h-3 w-3 shrink-0 ${saved.isDefault ? "fill-current text-amber-500" : ""}`} />
                  <span className="truncate">
                    {saved.isDefault ? `Unset "${saved.name}" as default` : `Set "${saved.name}" as default`}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmDeleteSearch(saved)}
                  className="gap-1.5 pl-6"
                >
                  <Trash2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">Delete "{saved.name}"</span>
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteSearch}
        onOpenChange={(open) => !open && setConfirmDeleteSearch(null)}
        title="Delete saved view?"
        description={confirmDeleteSearch ? `"${confirmDeleteSearch.name}" can't be recovered after this.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteSearch) await deleteSavedSearch(confirmDeleteSearch);
        }}
      />

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current view</DialogTitle>
            <DialogDescription>Saves every active filter on this page, so you can come back to it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1">Name</Label>
              <Input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Strong baseball fits"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Checkbox
                id="save-as-default"
                checked={saveAsDefault}
                onCheckedChange={(checked) => setSaveAsDefault(checked === true)}
              />
              <Label htmlFor="save-as-default" className="text-sm font-normal">
                Open this view by default
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveCurrentView} disabled={savingSearch}>
              {savingSearch ? "Saving…" : "Save view"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            onClear={clearAll}
            variant="no-matches"
          />
        )
      ) : (
        <div className="grid gap-3">
          {postings.map((p, index) => {
            const overflowSkills = (p.matchedSkills ?? []).slice(4);
            const { className: entranceClassName, style: entranceStyle } = entrance(index);
            return (
              <Card
                key={p.id}
                style={entranceStyle}
                className={`hover:shadow-elev-2 transition-shadow duration-200 ease-out-quint ${
                  entranceClassName ?? ""
                } ${p.fitTier === "Strong" ? "edge-brand" : ""}`}
              >
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
                    {/* Internship is shown instead of (not alongside) a seniority badge: an
                        internship's seniority is null by design (see scrapers/src/seniority.ts —
                        it's a separate axis, not a rung on the ladder), so without this the badge
                        that used to say "Entry level" for these postings would just silently
                        vanish with nothing replacing it. */}
                    {p.isInternship ? (
                      <Badge variant="secondary">Internship</Badge>
                    ) : (
                      p.seniority && <Badge variant="secondary">{SENIORITY_LABELS[p.seniority] ?? p.seniority}</Badge>
                    )}
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
