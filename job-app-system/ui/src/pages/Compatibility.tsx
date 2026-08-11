import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/api/client";
import type { PostingCategory } from "@/api/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    async function load() {
      try {
        const profile = await api.profile.get();
        if (profile) {
          setSkills(profile.skills);
          setCoreSkills(profile.coreSkills ?? "");
          setPreferredCategories(
            new Set((profile.preferredCategories?.split(",").map((c) => c.trim()) ?? []) as PostingCategory[])
          );
          setLocationKeywords(profile.locationKeywords ?? "");
          setExcludeKeywords(profile.excludeKeywords ?? "");
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

  async function save() {
    setSaving(true);
    try {
      await api.profile.update({
        skills,
        coreSkills,
        preferredCategories: Array.from(preferredCategories).join(","),
        locationKeywords,
        excludeKeywords,
      });
      toast.success("Compatibility profile saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-semibold text-foreground">Compatibility</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Tell the app what fits you — Discovery scores and sorts postings against this profile.
      </p>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="text-sm font-medium text-foreground">Your profile</div>
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
            </div>

            <div>
              <Label>Preferred categories</Label>
              <div className="mt-1 grid grid-cols-2 gap-2">
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
            </div>

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

            <Button onClick={save} disabled={saving || skills.trim().length === 0}>
              {saving ? "Saving…" : "Save profile"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
