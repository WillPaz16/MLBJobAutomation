import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, MapPin, Search, SlidersHorizontal, Sparkles, Tags } from "lucide-react";
import { api } from "@/api/client";
import type { CandidateProfileInput, Posting, PostingCategory, ProfileCoverage } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS, CATEGORY_ORDER, EDUCATION_REQUIREMENT_LABELS, EDUCATION_REQUIREMENT_OPTIONS } from "@/lib/labels";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { histogram } from "@/lib/timeSeries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Histogram } from "@/components/charts/Histogram";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { useDebounced } from "@/hooks/useDebounced";

const CATEGORIES = CATEGORY_ORDER;

// Default core skills seeded when no profile exists yet — short, posting-facing terms that
// actually show up in job titles/descriptions, not CV vocabulary. See api/src/fitScore.ts's
// core-vs-secondary skill tiering (core matches weight 3x, secondary matches weight 1x).
const DEFAULT_CORE_SKILLS = [
  "python",
  "sql",
  "machine learning",
  "data science",
  "analytics",
  "r&d",
  "baseball",
  "statistics",
  "modeling",
];

// A rough heuristic for "posting-facing": short technical/domain nouns rather than CV-only
// vocabulary like "NSF", "publication", or "mentorship" — those dilute the score without ever
// matching a real posting. Not a classifier, just a stopword-style exclusion list.
const NON_POSTING_FACING_TAGS = new Set([
  "nsf",
  "icerm",
  "publication",
  "publications",
  "teaching",
  "mentorship",
  "independent research",
  "grant",
  "grants",
  "conference",
  "presentation",
  "award",
  "fellowship",
]);

// Fixed 5-bin histogram over the 0-100 fit-score domain, labeled to match the tier thresholds
// used everywhere else (Strong>=65, Good>=40, Fair>=20, Weak<20) — see api/src/fitScore.ts.
const HISTOGRAM_BINS = 5;

// Base UI's Select doesn't accept an empty-string item value, so "not set" needs its own sentinel
// — same "all"-as-sentinel pattern Discovery's filters already use, just mapped to null instead
// of "no filter" on save.
const EDUCATION_LEVEL_UNSET = "UNSET";
const HISTOGRAM_LABELS = ["0-20", "20-40", "40-60", "60-80", "80-100"];

const TIERS: (keyof ProfileCoverage["tierCounts"])[] = ["Strong", "Good", "Fair", "Weak"];

function DeltaStrip({ base, preview }: { base: ProfileCoverage; preview: ProfileCoverage }) {
  return (
    <div className="space-y-1 text-sm">
      {TIERS.map((tier) => {
        const from = base.tierCounts[tier];
        const to = preview.tierCounts[tier];
        const delta = to - from;
        if (delta === 0) return null;
        return (
          <div key={tier} className="flex items-center justify-between">
            <span className="text-muted-foreground">{tier}</span>
            <span className="tabular">
              {from} → {to}{" "}
              <span className={delta > 0 ? "text-green-600 dark:text-green-400" : "text-destructive"}>
                ({delta > 0 ? "+" : ""}
                {delta})
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-chart-4/30 px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function WhyScoringPopover() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 300);
  const [results, setResults] = useState<Posting[]>([]);
  const [selected, setSelected] = useState<Posting | null>(null);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    api.postings
      .list({ q: debouncedQuery, take: 8 })
      .then(({ postings }) => {
        if (!cancelled) setResults(postings);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  async function select(id: string) {
    try {
      const posting = await api.postings.get(id);
      setSelected(posting);
      setResults([]);
      setQuery("");
    } catch {
      toast.error("Failed to load that posting");
    }
  }

  return (
    <Popover onOpenChange={(open) => !open && setSelected(null)}>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="w-full" />}>
        <Search className="mr-1 size-3.5" />
        Why did this score?
      </PopoverTrigger>
      <PopoverContent className="w-80">
        {!selected ? (
          <>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a posting title or org…"
            />
            {results.length > 0 && (
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => select(p.id)}
                      className="w-full rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted"
                    >
                      <div className="truncate font-medium text-foreground">{p.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.organization}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{selected.title}</div>
                <div className="truncate text-xs text-muted-foreground">{selected.organization}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Back
              </Button>
            </div>
            {selected.reasons && selected.reasons.length > 0 ? (
              <ul className="space-y-0.5 text-sm">
                {selected.reasons.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="tabular">
                      {r.points >= 0 ? "+" : ""}
                      {r.points}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No scoring breakdown available.</p>
            )}
            {selected.evidence && selected.evidence.length > 0 && (
              <div className="space-y-1.5">
                {selected.evidence.slice(0, 3).map((e, i) => (
                  <div key={i} className="rounded-md bg-muted/50 p-2 text-xs">
                    {highlight(e.excerpt, e.term)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// The candidate's own skills/preferences, scored deterministically against posting descriptions
// (api/src/fitScore.ts) — same keyword-substring style as scrapers/src/categorize.ts, not an ML
// dependency (see CLAUDE.md's documented decision to defer semantic/embedding matching).
export function Compatibility() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [skills, setSkills] = useState("");
  const [coreSkills, setCoreSkills] = useState("");
  const [preferredCategories, setPreferredCategories] = useState<Set<PostingCategory>>(new Set());
  const [locationKeywords, setLocationKeywords] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [highestEducationLevel, setHighestEducationLevel] = useState<string>(EDUCATION_LEVEL_UNSET);
  const [coverage, setCoverage] = useState<ProfileCoverage | null>(null);
  const [preview, setPreview] = useState<ProfileCoverage | null>(null);
  const [savedDraft, setSavedDraft] = useState<CandidateProfileInput | null>(null);

  function loadCoverage() {
    api.profile
      .coverage()
      .then(setCoverage)
      .catch(() => {
        // leave the last-known coverage (or null) in place if this fails — it's a diagnostic
        // add-on, not something that should block the rest of the page
      });
  }

  useEffect(() => {
    loadCoverage();
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const profile = await api.profile.get();
        if (profile) {
          const draft: CandidateProfileInput = {
            skills: profile.skills,
            coreSkills: profile.coreSkills ?? "",
            preferredCategories: profile.preferredCategories ?? "",
            locationKeywords: profile.locationKeywords ?? "",
            excludeKeywords: profile.excludeKeywords ?? "",
            highestEducationLevel: profile.highestEducationLevel ?? null,
          };
          setSkills(draft.skills);
          setCoreSkills(draft.coreSkills ?? "");
          setPreferredCategories(
            new Set((profile.preferredCategories?.split(",").map((c) => c.trim()) ?? []) as PostingCategory[])
          );
          setLocationKeywords(draft.locationKeywords ?? "");
          setExcludeKeywords(draft.excludeKeywords ?? "");
          setHighestEducationLevel(profile.highestEducationLevel ?? EDUCATION_LEVEL_UNSET);
          setSavedDraft(draft);
        } else {
          // No profile yet — seed core skills from a curated, posting-facing default list, and
          // seed secondary skills from existing ResumeBullet tags minus the CV-only vocabulary
          // that can never match a real posting (see NON_POSTING_FACING_TAGS above). Everything
          // stays fully editable before ever being saved.
          const bullets = await api.resumeBullets.list();
          const tags = new Set<string>();
          for (const bullet of bullets) {
            for (const tag of bullet.tags?.split(",") ?? []) {
              const trimmed = tag.trim();
              if (trimmed && !NON_POSTING_FACING_TAGS.has(trimmed.toLowerCase())) tags.add(trimmed);
            }
          }
          setCoreSkills(DEFAULT_CORE_SKILLS.join(", "));
          setSkills(Array.from(tags).join(", "));
          // No profile exists yet, so there's nothing "saved" to diff against — but isDirty
          // requires savedDraft !== null (see below), so without setting a baseline here the
          // live preview could never fire for a brand-new user. Baseline against the empty
          // shape (not the seeded defaults) so editing away from the seeded skills/coreSkills
          // correctly counts as a dirty edit.
          setSavedDraft({
            skills: "",
            coreSkills: "",
            preferredCategories: "",
            locationKeywords: "",
            excludeKeywords: "",
            highestEducationLevel: null,
          });
        }
      } catch {
        // leave the form blank/editable if resume bullets or the profile fail to load
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleCategory(category: PostingCategory, checked: boolean) {
    setPreferredCategories((prev) => {
      const next = new Set(prev);
      if (checked) next.add(category);
      else next.delete(category);
      return next;
    });
  }

  const draft: CandidateProfileInput = useMemo(
    () => ({
      skills,
      coreSkills,
      preferredCategories: Array.from(preferredCategories).join(","),
      locationKeywords,
      excludeKeywords,
      highestEducationLevel: highestEducationLevel === EDUCATION_LEVEL_UNSET ? null : highestEducationLevel,
    }),
    [skills, coreSkills, preferredCategories, locationKeywords, excludeKeywords, highestEducationLevel]
  );

  const isDirty =
    !loading &&
    savedDraft !== null &&
    JSON.stringify(draft) !== JSON.stringify(savedDraft);

  const debouncedDraft = useDebounced(draft, 400);

  // Live preview on unsaved edits only — previewCoverage never persists (scored against an
  // unsaved draft, see api/src/routes/profile.ts's shared computeCoverage).
  useEffect(() => {
    if (!isDirty || !skills.trim()) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    api.profile
      .previewCoverage(debouncedDraft)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDraft, isDirty]);

  async function save() {
    setSaving(true);
    try {
      await api.profile.update(draft);
      toast.success("Compatibility profile saved");
      setSavedDraft(draft);
      setPreview(null);
      loadCoverage();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const matchedSkillCount = coverage?.skills.filter((s) => s.postings > 0).length ?? 0;
  const unmatchedSkills = coverage?.skills.filter((s) => s.postings === 0) ?? [];
  const matchedSkills = coverage?.skills.filter((s) => s.postings > 0) ?? [];
  const { calibration } = coverage ?? {};

  const bins = coverage ? histogram(coverage.fitScores, HISTOGRAM_BINS, [0, 100]) : new Array(HISTOGRAM_BINS).fill(0);

  return (
    <PageLayout>
      <PageHeader
        icon={SlidersHorizontal}
        title="Compatibility"
        description="Tell the app what fits you — Discovery scores and sorts postings against this profile."
        count={coverage ? { value: coverage.totalPostings, noun: "scored postings" } : undefined}
      />

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" />
                  <CardTitle>Skills</CardTitle>
                </div>
                <CardDescription>What you're strongest in, and the broader match pool.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label htmlFor="coreSkills">Core skills</Label>
                  <Textarea
                    id="coreSkills"
                    value={coreSkills}
                    onChange={(e) => setCoreSkills(e.target.value)}
                    placeholder="python, sql, machine learning, r&d, baseball"
                    className="mt-1"
                    rows={2}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Comma-separated — your strongest, most posting-facing terms. Weighted 3x higher than the skills
                    below.
                  </p>
                </div>

                <div>
                  <Label htmlFor="skills">Skills</Label>
                  <Textarea
                    id="skills"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="python, sql, biomechanics, data visualization"
                    className="mt-1"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Comma-separated — the broader/secondary match pool. Skills that never match any posting only
                    dilute the score, not help it — prune terms that are pure CV vocabulary (e.g. "publication",
                    "mentorship") rather than skills a job posting would actually mention.
                  </p>
                  {coverage && coverage.skills.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {matchedSkillCount} of {coverage.skills.length} skills match at least one posting.
                    </p>
                  )}
                  {(matchedSkills.length > 0 || unmatchedSkills.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {matchedSkills.map((s) => (
                        <Badge key={s.term} variant="secondary">
                          {s.term} · {s.postings}
                        </Badge>
                      ))}
                      {unmatchedSkills.map((s) => (
                        <Badge
                          key={s.term}
                          variant="outline"
                          className="gap-1 border-destructive/40 text-destructive"
                        >
                          {s.term}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <Tags className="size-4 text-primary" />
                  <CardTitle>Categories</CardTitle>
                </div>
                <CardDescription>Categories you'd prefer to see more of.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((category) => (
                    <div key={category} className="flex items-center gap-2">
                      <Checkbox
                        id={`category-${category}`}
                        checked={preferredCategories.has(category)}
                        onCheckedChange={(checked) => toggleCategory(category, checked === true)}
                      />
                      <Label htmlFor={`category-${category}`} className="text-sm font-normal">
                        {CATEGORY_LABELS[category]}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="size-4 text-primary" />
                  <CardTitle>Education</CardTitle>
                </div>
                <CardDescription>
                  Your highest degree — postings requiring more than this take a fit-score penalty.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="highestEducationLevel">Highest education level</Label>
                <Select
                  value={highestEducationLevel}
                  onValueChange={(v) => setHighestEducationLevel(v ?? EDUCATION_LEVEL_UNSET)}
                >
                  <SelectTrigger id="highestEducationLevel" className="mt-1 w-full sm:w-64">
                    <SelectValue labels={{ [EDUCATION_LEVEL_UNSET]: "Not set", ...EDUCATION_REQUIREMENT_LABELS }} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EDUCATION_LEVEL_UNSET}>Not set</SelectItem>
                    {EDUCATION_REQUIREMENT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Separator />

            <Card>
              <CardHeader>
                <div className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-primary" />
                  <CardTitle>Location & exclusions</CardTitle>
                </div>
                <CardDescription>A small location boost, and dealbreaker terms.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="locationKeywords">Location keywords</Label>
                    <Textarea
                      id="locationKeywords"
                      value={locationKeywords}
                      onChange={(e) => setLocationKeywords(e.target.value)}
                      placeholder="chicago, remote"
                      className="mt-1"
                      rows={2}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Comma-separated — a small location boost.</p>
                  </div>
                  <div>
                    <Label htmlFor="excludeKeywords">Exclude keywords</Label>
                    <Textarea
                      id="excludeKeywords"
                      value={excludeKeywords}
                      onChange={(e) => setExcludeKeywords(e.target.value)}
                      placeholder="internship, unpaid"
                      className="mt-1"
                      rows={2}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">Comma-separated — a dealbreaker penalty.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={save} disabled={saving || skills.trim().length === 0}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </div>

          <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Fit distribution</CardTitle>
                <CardDescription>Across all currently active postings.</CardDescription>
              </CardHeader>
              <CardContent>
                {coverage ? (
                  <Histogram title="Fit score distribution" bins={bins} binLabels={HISTOGRAM_LABELS} width={340} height={180} />
                ) : (
                  <Skeleton className="h-44 w-full rounded-md" />
                )}
                {coverage && (
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    {TIERS.map((tier) => (
                      <div key={tier}>
                        <div className="text-2xl font-semibold tabular text-foreground">
                          {coverage.tierCounts[tier]}
                        </div>
                        <div className="text-xs text-muted-foreground">{tier}</div>
                      </div>
                    ))}
                  </div>
                )}
                {isDirty && preview && coverage && (
                  <div className="mt-3 border-t pt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Unsaved changes preview</p>
                    <DeltaStrip base={coverage} preview={preview} />
                  </div>
                )}
              </CardContent>
            </Card>

            {calibration && (calibration.dismissedCount > 0 || calibration.appliedCount > 0) && (
              <Card className="edge-brand">
                <CardHeader>
                  <CardTitle>Calibration</CardTitle>
                  <CardDescription>How well the score tracks your real decisions.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {calibration.dismissedCount > 0 &&
                      `Postings you've dismissed score ${Math.round(calibration.dismissedAvg ?? 0)} on average (n=${calibration.dismissedCount}). `}
                    {calibration.appliedCount > 0 &&
                      `Postings you've applied to score ${Math.round(calibration.appliedAvg ?? 0)} on average (n=${calibration.appliedCount}).`}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent>
                <WhyScoringPopover />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
