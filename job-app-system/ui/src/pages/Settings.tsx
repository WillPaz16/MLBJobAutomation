import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { api, ApiError } from "../api/client";
import type {
  AnswerOverride,
  AnswerSnippet,
  Application,
  ApplicantIdentity,
  ApplicantIdentityInput,
  EducationEntry,
  OrgProfile,
  TonePreset,
} from "../api/types";
import { PageHeader, PageLayout } from "@/components/PageLayout";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// EEO self-identification option lists. Wording follows the federal EEO-1/CC-305 forms (the
// stated reason ApplicantIdentity stores code+label pairs at all — see schema.prisma's doc
// comment) rather than any one ATS's specific phrasing, since this is the canonical source and
// every ATS's own dropdown is itself a variant of it.
const GENDER_OPTIONS = [
  { code: "male", label: "Male" },
  { code: "female", label: "Female" },
  { code: "nonbinary", label: "Non-binary" },
  { code: "decline", label: "I don't wish to answer" },
];

const RACE_ETHNICITY_OPTIONS = [
  { code: "hispanic_latino", label: "Hispanic or Latino" },
  { code: "white", label: "White (Not Hispanic or Latino)" },
  { code: "black", label: "Black or African American (Not Hispanic or Latino)" },
  { code: "native_american", label: "Native American or Alaska Native (Not Hispanic or Latino)" },
  { code: "asian", label: "Asian (Not Hispanic or Latino)" },
  { code: "pacific_islander", label: "Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)" },
  { code: "two_or_more", label: "Two or More Races (Not Hispanic or Latino)" },
  { code: "decline", label: "I don't wish to answer" },
];

// CC-305's exact required wording for the "yes/no/decline" disability self-identification form.
const DISABILITY_OPTIONS = [
  { code: "yes", label: "Yes, I have a disability, or have had one in the past" },
  { code: "no", label: "No, I do not have a disability and have not had one in the past" },
  { code: "decline", label: "I do not want to answer" },
];

const VETERAN_OPTIONS = [
  { code: "protected_veteran", label: "I identify as one or more of the classifications of a protected veteran" },
  { code: "not_veteran", label: "I am not a protected veteran" },
  { code: "decline", label: "I don't wish to answer" },
];

// Three-state control for the nullable work-authorization booleans — null means "declined to
// answer" and must never be conflated with false (see schema.prisma's ApplicantIdentity comment
// and CLAUDE.md's task brief). A plain checkbox can't express that third state.
function TriStateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: { value: boolean | null; text: string }[] = [
    { value: true, text: "Yes" },
    { value: false, text: "No" },
    { value: null, text: "Declined" },
  ];
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {options.map((opt) => (
          <Button
            key={String(opt.value)}
            type="button"
            size="sm"
            variant={value === opt.value ? "default" : "outline"}
            onClick={() => onChange(opt.value)}
          >
            {opt.text}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function EeoField({
  label,
  options,
  code,
  onChange,
}: {
  label: string;
  options: { code: string; label: string }[];
  code: string | null;
  onChange: (code: string | null, label: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select
        value={code ?? "__none__"}
        onValueChange={(v) => {
          if (v === "__none__") {
            onChange(null, null);
            return;
          }
          const opt = options.find((o) => o.code === v);
          onChange(opt?.code ?? null, opt?.label ?? null);
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder="Not answered"
            labels={{
              __none__: "Not answered",
              ...Object.fromEntries(options.map((o) => [o.code, o.label])),
            }}
          />
        </SelectTrigger>
        <SelectContent>
          {/* Explicit sentinel so a previously-answered EEO field can be cleared back to "Not
              answered" — Base UI's Select otherwise has no item representing that state, and
              once a real code is chosen there's no way back short of a DB edit. Same "__none__"
              convention as Pipeline.tsx's DocPicker. */}
          <SelectItem value="__none__">Not answered</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.code} value={o.code}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Identity tab — a form over every ApplicantIdentity field. Saved with an explicit "Save" button
// (not debounced autosave): this data includes DOB/address/EEO fields, and a PUT firing on every
// keystroke risks a half-typed value (e.g. a partial ZIP or an accidental clear) landing in
// storage before the user has finished. An explicit save also gives a clear "Saved" confirmation
// moment, which matters more here than on a low-stakes filter form.
function IdentityTab() {
  const [identity, setIdentity] = useState<ApplicantIdentity | null>(null);
  const [draft, setDraft] = useState<ApplicantIdentityInput>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.identity
      .get()
      .then((data) => {
        setIdentity(data);
        if (data) setDraft(data);
      })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof ApplicantIdentityInput>(key: K, value: ApplicantIdentityInput[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.identity.update(draft);
      setIdentity(updated);
      setDraft(updated);
      toast.success("Identity saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save identity");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Name & contact</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Legal first name" value={draft.legalFirstName ?? ""} onChange={(v) => set("legalFirstName", v)} />
          <Field label="Legal middle name" value={draft.legalMiddleName ?? ""} onChange={(v) => set("legalMiddleName", v)} />
          <Field label="Legal last name" value={draft.legalLastName ?? ""} onChange={(v) => set("legalLastName", v)} />
          <Field label="Preferred name" value={draft.preferredName ?? ""} onChange={(v) => set("preferredName", v)} />
          <Field label="Email" value={draft.email ?? ""} onChange={(v) => set("email", v)} />
          <Field label="Phone" value={draft.phone ?? ""} onChange={(v) => set("phone", v)} />
          <Field
            label="Date of birth (YYYY-MM-DD)"
            value={draft.dateOfBirth ?? ""}
            onChange={(v) => set("dateOfBirth", v)}
            placeholder="1999-03-14"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Street" value={draft.addressStreet ?? ""} onChange={(v) => set("addressStreet", v)} />
          <Field label="City" value={draft.addressCity ?? ""} onChange={(v) => set("addressCity", v)} />
          <Field label="State" value={draft.addressState ?? ""} onChange={(v) => set("addressState", v)} />
          <Field label="Zip" value={draft.addressZip ?? ""} onChange={(v) => set("addressZip", v)} />
          <Field label="Country" value={draft.addressCountry ?? ""} onChange={(v) => set("addressCountry", v)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Work authorization</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TriStateField
            label="Are you legally authorized to work in the US?"
            value={draft.authorizedToWorkUs ?? null}
            onChange={(v) => set("authorizedToWorkUs", v)}
          />
          <TriStateField
            label="Will you now or in the future require sponsorship?"
            value={draft.requiresSponsorship ?? null}
            onChange={(v) => set("requiresSponsorship", v)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Voluntary self-identification (EEO)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <EeoField
            label="Gender"
            options={GENDER_OPTIONS}
            code={draft.genderIdentityCode ?? null}
            onChange={(code, label) => {
              set("genderIdentityCode", code);
              set("genderIdentityLabel", label);
            }}
          />
          <EeoField
            label="Race / ethnicity"
            options={RACE_ETHNICITY_OPTIONS}
            code={draft.raceEthnicityCode ?? null}
            onChange={(code, label) => {
              set("raceEthnicityCode", code);
              set("raceEthnicityLabel", label);
            }}
          />
          <EeoField
            label="Disability status"
            options={DISABILITY_OPTIONS}
            code={draft.disabilityStatusCode ?? null}
            onChange={(code, label) => {
              set("disabilityStatusCode", code);
              set("disabilityStatusLabel", label);
            }}
          />
          <EeoField
            label="Veteran status"
            options={VETERAN_OPTIONS}
            code={draft.veteranStatusCode ?? null}
            onChange={(code, label) => {
              set("veteranStatusCode", code);
              set("veteranStatusLabel", label);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile URLs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="LinkedIn" value={draft.linkedinUrl ?? ""} onChange={(v) => set("linkedinUrl", v)} />
          <Field label="Portfolio" value={draft.portfolioUrl ?? ""} onChange={(v) => set("portfolioUrl", v)} />
          <Field label="GitHub" value={draft.githubUrl ?? ""} onChange={(v) => set("githubUrl", v)} />
          <Field label="Other" value={draft.otherUrl ?? ""} onChange={(v) => set("otherUrl", v)} />
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save identity"}
      </Button>
      {identity?.updatedAt && (
        <span className="ml-2 text-xs text-muted-foreground">
          Last saved {new Date(identity.updatedAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}

function emptyEducationDraft(): Partial<EducationEntry> {
  return { school: "", degree: "", fieldOfStudy: "", startDate: "", endDate: "", gpa: "", isPrimary: false };
}

// Education tab — list of EducationEntry rows with add/edit/delete. isPrimary is presented as a
// per-entry checkbox (each entry is edited individually, not as a radio group, so it must be
// possible to un-set it directly) — the server enforces cross-entry exclusivity transactionally
// in api/src/routes/identity.ts, this UI just reflects that, not re-implements it.
function EducationTab() {
  const [entries, setEntries] = useState<EducationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Partial<EducationEntry>>(emptyEducationDraft());
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api.identity.education
      .list()
      .then(setEntries)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function startEdit(entry?: EducationEntry) {
    setEditingId(entry?.id ?? "new");
    setDraft(entry ?? emptyEducationDraft());
  }

  async function save() {
    setSaving(true);
    try {
      if (editingId === "new") {
        await api.identity.education.create(draft);
      } else if (editingId) {
        await api.identity.education.update(editingId, draft);
      }
      setEditingId(null);
      load();
      toast.success("Education saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save education entry");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.identity.education.remove(id);
      toast.success("Education entry deleted");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete education entry");
    }
  }

  if (loading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id}>
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                {entry.school || "(no school)"}
                {entry.isPrimary && <Badge variant="secondary">Primary</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {entry.degree} {entry.fieldOfStudy ? `· ${entry.fieldOfStudy}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {entry.startDate ?? "?"} – {entry.endDate ?? "present"} {entry.gpa ? `· GPA ${entry.gpa}` : ""}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => startEdit(entry)}>
                Edit
              </Button>
              <Button size="icon-xs" variant="ghost" onClick={() => setConfirmDeleteId(entry.id)} aria-label="Delete">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {editingId ? (
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="School" value={draft.school ?? ""} onChange={(v) => setDraft((d) => ({ ...d, school: v }))} />
            <Field label="Degree" value={draft.degree ?? ""} onChange={(v) => setDraft((d) => ({ ...d, degree: v }))} />
            <Field
              label="Field of study"
              value={draft.fieldOfStudy ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, fieldOfStudy: v }))}
            />
            <Field label="GPA" value={draft.gpa ?? ""} onChange={(v) => setDraft((d) => ({ ...d, gpa: v }))} />
            <Field
              label="Start date"
              value={draft.startDate ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, startDate: v }))}
              placeholder="YYYY-MM or YYYY-MM-DD"
            />
            <Field
              label="End date"
              value={draft.endDate ?? ""}
              onChange={(v) => setDraft((d) => ({ ...d, endDate: v }))}
              placeholder="YYYY-MM or YYYY-MM-DD"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!draft.isPrimary}
                onChange={(e) => setDraft((d) => ({ ...d, isPrimary: e.target.checked }))}
              />
              Primary degree (only one entry can be primary — the server unsets any other
              entry's primary flag when this one is saved as primary)
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" onClick={() => startEdit()}>
          <Plus className="size-4" /> Add education
        </Button>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
        title="Delete education entry?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteId) await remove(confirmDeleteId);
        }}
      />
    </div>
  );
}

function emptySnippetDraft(): Partial<AnswerSnippet> {
  return { category: "", question: "", template: "", tags: "", isActive: true };
}

// Answers tab — AnswerSnippet CRUD plus AnswerOverride CRUD scoped to a chosen application.
function AnswersTab() {
  const [snippets, setSnippets] = useState<AnswerSnippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Partial<AnswerSnippet>>(emptySnippetDraft());
  const [saving, setSaving] = useState(false);

  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [overrides, setOverrides] = useState<AnswerOverride[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<{ questionKey: string; answer: string; snippetId: string | null }>(
    { questionKey: "", answer: "", snippetId: null }
  );
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  const [confirmDeleteSnippetId, setConfirmDeleteSnippetId] = useState<string | null>(null);
  const [confirmDeleteOverrideId, setConfirmDeleteOverrideId] = useState<string | null>(null);

  function loadSnippets() {
    setLoading(true);
    api.answers.snippets
      .list()
      .then(setSnippets)
      .finally(() => setLoading(false));
  }

  useEffect(loadSnippets, []);
  useEffect(() => {
    api.applications.list().then(setApplications);
  }, []);

  useEffect(() => {
    cancelEditOverride();
    if (!selectedAppId) {
      setOverrides([]);
      return;
    }
    api.answers.overrides.list({ applicationId: selectedAppId }).then(setOverrides);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId]);

  function startEdit(snippet?: AnswerSnippet) {
    setEditingId(snippet?.id ?? "new");
    setDraft(snippet ?? emptySnippetDraft());
  }

  async function save() {
    setSaving(true);
    try {
      if (editingId === "new") {
        await api.answers.snippets.create(draft);
      } else if (editingId) {
        await api.answers.snippets.update(editingId, draft);
      }
      setEditingId(null);
      loadSnippets();
      toast.success("Answer snippet saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save snippet");
    } finally {
      setSaving(false);
    }
  }

  async function removeSnippet(id: string) {
    try {
      await api.answers.snippets.remove(id);
      toast.success("Answer snippet deleted");
      loadSnippets();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete snippet");
    }
  }

  function startEditOverride(override: AnswerOverride) {
    setEditingOverrideId(override.id);
    setOverrideDraft({
      questionKey: override.questionKey,
      answer: override.answer,
      snippetId: override.snippetId ?? null,
    });
  }

  function cancelEditOverride() {
    setEditingOverrideId(null);
    setOverrideDraft({ questionKey: "", answer: "", snippetId: null });
  }

  async function saveOverride() {
    if (!selectedAppId || !overrideDraft.questionKey || !overrideDraft.answer) return;
    setSavingOverride(true);
    try {
      if (editingOverrideId) {
        await api.answers.overrides.update(editingOverrideId, {
          questionKey: overrideDraft.questionKey,
          answer: overrideDraft.answer,
          snippetId: overrideDraft.snippetId,
        });
      } else {
        await api.answers.overrides.create({
          applicationId: selectedAppId,
          questionKey: overrideDraft.questionKey,
          answer: overrideDraft.answer,
          snippetId: overrideDraft.snippetId,
        });
      }
      setEditingOverrideId(null);
      setOverrideDraft({ questionKey: "", answer: "", snippetId: null });
      const refreshed = await api.answers.overrides.list({ applicationId: selectedAppId });
      setOverrides(refreshed);
      toast.success("Override saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save override");
    } finally {
      setSavingOverride(false);
    }
  }

  async function removeOverride(id: string) {
    try {
      await api.answers.overrides.remove(id);
      toast.success("Override deleted");
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      if (editingOverrideId === id) cancelEditOverride();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete override");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Answer snippets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Supported placeholders in a template: <code>{"{{org}}"}</code>, <code>{"{{role}}"}</code>, and{" "}
            <code>{"{{orgNotes}}"}</code> (resolved from that org's notes on the Tone & Orgs tab). Unknown
            placeholders are left as-is and flagged, never silently blanked.
          </p>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            snippets.map((s) => (
              <Card key={s.id} size="sm">
                <CardContent className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">
                      {s.question} <Badge variant="secondary">{s.category}</Badge>{" "}
                      {!s.isActive && <Badge variant="outline">Inactive</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{s.template}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => startEdit(s)}>
                      Edit
                    </Button>
                    <Button size="icon-xs" variant="ghost" onClick={() => setConfirmDeleteSnippetId(s.id)} aria-label="Delete">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {editingId ? (
            <Card size="sm">
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field label="Category" value={draft.category ?? ""} onChange={(v) => setDraft((d) => ({ ...d, category: v }))} />
                <Field label="Question" value={draft.question ?? ""} onChange={(v) => setDraft((d) => ({ ...d, question: v }))} />
                <div className="space-y-1 sm:col-span-2">
                  <Label>Template</Label>
                  <Textarea
                    value={draft.template ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
                    rows={4}
                  />
                </div>
                <Field label="Tags" value={draft.tags ?? ""} onChange={(v) => setDraft((d) => ({ ...d, tags: v }))} />
                <div className="flex gap-2 sm:col-span-2">
                  <Button onClick={save} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button variant="outline" onClick={() => startEdit()}>
              <Plus className="size-4" /> Add snippet
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-application overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Application</Label>
            <Select value={selectedAppId} onValueChange={(v) => setSelectedAppId(v ?? "")}>
              <SelectTrigger className="w-full">
                {/* Explicit function-children, not `labels`: values here are Application ids
                    (cuids), not a fixed enum, so the trigger must look up the real application's
                    posting title/org rather than fall back to prettifyLabel(id), which would
                    render a garbled cuid string. Same pattern as Pipeline.tsx's DocPicker. */}
                <SelectValue placeholder="Select an application">
                  {(v: string) => {
                    const a = applications.find((app) => app.id === v);
                    return a ? `${a.posting?.title} — ${a.posting?.organization}` : v;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {applications.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.posting?.title} — {a.posting?.organization}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedAppId && (
            <>
              {overrides.map((o) => (
                <Card key={o.id} size="sm">
                  <CardContent className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">{o.questionKey}</div>
                      <p className="text-sm text-muted-foreground">{o.answer}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => startEditOverride(o)}>
                        Edit
                      </Button>
                      <Button size="icon-xs" variant="ghost" onClick={() => setConfirmDeleteOverrideId(o.id)} aria-label="Delete">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card size="sm">
                <CardContent className="grid gap-3">
                  <Field
                    label="Question key"
                    value={overrideDraft.questionKey}
                    onChange={(v) => setOverrideDraft((d) => ({ ...d, questionKey: v }))}
                  />
                  <div className="space-y-1">
                    <Label>Answer</Label>
                    <Textarea
                      value={overrideDraft.answer}
                      onChange={(e) => setOverrideDraft((d) => ({ ...d, answer: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={saveOverride} disabled={savingOverride}>
                      {savingOverride ? "Saving…" : editingOverrideId ? "Save changes" : "Save override"}
                    </Button>
                    {editingOverrideId && (
                      <Button variant="outline" onClick={cancelEditOverride}>
                        Cancel
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDeleteSnippetId}
        onOpenChange={(open) => !open && setConfirmDeleteSnippetId(null)}
        title="Delete answer snippet?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteSnippetId) await removeSnippet(confirmDeleteSnippetId);
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteOverrideId}
        onOpenChange={(open) => !open && setConfirmDeleteOverrideId(null)}
        title="Delete override?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteOverrideId) await removeOverride(confirmDeleteOverrideId);
        }}
      />
    </div>
  );
}

function emptyToneDraft(): Partial<TonePreset> {
  return { name: "", guidance: "", isDefault: false };
}

function emptyOrgDraft(): Partial<OrgProfile> {
  return { organizationName: "", notes: "", preferredToneId: null };
}

// Tone & Orgs tab — plain CRUD forms over TonePreset/OrgProfile, no drafting/generate button.
// CLAUDE.md's tailoring-framework deferral is specifically about an in-app "generate" feature —
// this is a text editor for two tables that already have tested CRUD routes but zero UI.
function ToneOrgsTab() {
  const [tones, setTones] = useState<TonePreset[]>([]);
  const [orgs, setOrgs] = useState<OrgProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [toneEditingId, setToneEditingId] = useState<string | "new" | null>(null);
  const [toneDraft, setToneDraft] = useState<Partial<TonePreset>>(emptyToneDraft());
  const [orgEditingId, setOrgEditingId] = useState<string | "new" | null>(null);
  const [orgDraft, setOrgDraft] = useState<Partial<OrgProfile>>(emptyOrgDraft());
  const [saving, setSaving] = useState(false);
  const [confirmDeleteToneId, setConfirmDeleteToneId] = useState<string | null>(null);
  const [confirmDeleteOrgId, setConfirmDeleteOrgId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    Promise.all([api.tonePresets.list(), api.orgProfiles.list()])
      .then(([t, o]) => {
        setTones(t);
        setOrgs(o);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function saveTone() {
    setSaving(true);
    try {
      if (toneEditingId === "new") await api.tonePresets.create(toneDraft as { name: string; guidance: string });
      else if (toneEditingId) await api.tonePresets.update(toneEditingId, toneDraft);
      setToneEditingId(null);
      load();
      toast.success("Tone preset saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save tone preset");
    } finally {
      setSaving(false);
    }
  }

  async function removeTone(id: string) {
    try {
      await api.tonePresets.remove(id);
      toast.success("Tone preset deleted");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete tone preset");
    }
  }

  async function saveOrg() {
    setSaving(true);
    try {
      if (orgEditingId === "new") await api.orgProfiles.create(orgDraft as { organizationName: string });
      else if (orgEditingId) await api.orgProfiles.update(orgEditingId, orgDraft);
      setOrgEditingId(null);
      load();
      toast.success("Org profile saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to save org profile");
    } finally {
      setSaving(false);
    }
  }

  async function removeOrg(id: string) {
    try {
      await api.orgProfiles.remove(id);
      toast.success("Org profile deleted");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete org profile");
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Tone presets</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tones.map((t) => (
            <Card key={t.id} size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">
                    {t.name} {t.isDefault && <Badge variant="secondary">Default</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{t.guidance}</p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setToneEditingId(t.id);
                      setToneDraft(t);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => setConfirmDeleteToneId(t.id)} aria-label="Delete">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {toneEditingId ? (
            <Card size="sm">
              <CardContent className="grid gap-3">
                <Field label="Name" value={toneDraft.name ?? ""} onChange={(v) => setToneDraft((d) => ({ ...d, name: v }))} />
                <div className="space-y-1">
                  <Label>Guidance</Label>
                  <Textarea
                    value={toneDraft.guidance ?? ""}
                    onChange={(e) => setToneDraft((d) => ({ ...d, guidance: e.target.value }))}
                    rows={3}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!toneDraft.isDefault}
                    onChange={(e) => setToneDraft((d) => ({ ...d, isDefault: e.target.checked }))}
                  />
                  Default preset
                </label>
                <div className="flex gap-2">
                  <Button onClick={saveTone} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setToneEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setToneEditingId("new");
                setToneDraft(emptyToneDraft());
              }}
            >
              <Plus className="size-4" /> Add tone preset
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Org profiles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {orgs.map((o) => (
            <Card key={o.id} size="sm">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium text-foreground">{o.organizationName}</div>
                  <p className="text-sm text-muted-foreground">{o.notes || "(no notes)"}</p>
                  {o.preferredTone && <Badge variant="secondary">{o.preferredTone.name}</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setOrgEditingId(o.id);
                      setOrgDraft(o);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="icon-xs" variant="ghost" onClick={() => setConfirmDeleteOrgId(o.id)} aria-label="Delete">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {orgEditingId ? (
            <Card size="sm">
              <CardContent className="grid gap-3">
                <Field
                  label="Organization name"
                  value={orgDraft.organizationName ?? ""}
                  onChange={(v) => setOrgDraft((d) => ({ ...d, organizationName: v }))}
                />
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea
                    value={orgDraft.notes ?? ""}
                    onChange={(e) => setOrgDraft((d) => ({ ...d, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Preferred tone</Label>
                  <Select
                    value={orgDraft.preferredToneId ?? "__none__"}
                    onValueChange={(v) =>
                      setOrgDraft((d) => ({ ...d, preferredToneId: v === "__none__" ? null : v }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder="Use default"
                        labels={{
                          __none__: "Use default",
                          ...Object.fromEntries(tones.map((t) => [t.id, t.name])),
                        }}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Explicit sentinel so a previously-set preferred tone can be cleared back
                          to "Use default" — same "__none__" convention as Pipeline.tsx's
                          DocPicker and the EEO fields above. */}
                      <SelectItem value="__none__">Use default</SelectItem>
                      {tones.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveOrg} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setOrgEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Button
              variant="outline"
              onClick={() => {
                setOrgEditingId("new");
                setOrgDraft(emptyOrgDraft());
              }}
            >
              <Plus className="size-4" /> Add org profile
            </Button>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDeleteToneId}
        onOpenChange={(open) => !open && setConfirmDeleteToneId(null)}
        title="Delete tone preset?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteToneId) await removeTone(confirmDeleteToneId);
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteOrgId}
        onOpenChange={(open) => !open && setConfirmDeleteOrgId(null)}
        title="Delete org profile?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (confirmDeleteOrgId) await removeOrg(confirmDeleteOrgId);
        }}
      />
    </div>
  );
}

export function Settings() {
  const tabs = useMemo(
    () => [
      { value: "identity", label: "Identity", content: <IdentityTab /> },
      { value: "education", label: "Education", content: <EducationTab /> },
      { value: "answers", label: "Answers", content: <AnswersTab /> },
      { value: "tone-orgs", label: "Tone & Orgs", content: <ToneOrgsTab /> },
    ],
    []
  );

  return (
    <PageLayout>
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        description="Applicant identity, education, reusable answers, and per-org tone preferences."
      />
      <Tabs defaultValue="identity">
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </PageLayout>
  );
}
