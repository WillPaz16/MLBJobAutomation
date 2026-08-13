import type {
  AnalyticsFunnel,
  AnalyticsMarket,
  AnalyticsSummary,
  AnalyticsTimeseries,
  AnswerOverride,
  AnswerOverrideInput,
  AnswerSnippet,
  AnswerSnippetInput,
  ApplicantIdentity,
  ApplicantIdentityInput,
  Application,
  ApplicationStage,
  ApplyPack,
  CandidateProfile,
  CandidateProfileInput,
  Document,
  DocumentDetail,
  EducationEntry,
  EducationEntryInput,
  OrgProfile,
  OrgProfileInput,
  Posting,
  PrepContext,
  ProfileCoverage,
  ResumeBullet,
  SavedSearch,
  TonePreset,
  TonePresetInput,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = `${options?.method ?? "GET"} ${path} failed: ${res.status}`;
    let details: unknown;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      details = body?.details;
    } catch {
      // response body wasn't JSON — fall back to the generic message above
    }
    throw new ApiError(res.status, message, details);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  postings: {
    list: async (params?: {
      category?: string;
      location?: string;
      q?: string;
      source?: string;
      organization?: string;
      status?: "active" | "closed" | "all";
      sort?: "discoveredAt_desc" | "discoveredAt_asc" | "postedAt_desc" | "postedAt_asc" | "fit_desc";
      hideDuplicates?: boolean;
      showDismissed?: boolean;
      seniority?: string;
      workMode?: string;
      region?: string;
      minFit?: number;
      isMlbTeam?: boolean;
      sourceSection?: string;
      isInternship?: string;
      discoveredAfter?: string;
      excludeInPipeline?: boolean;
      matchedSkill?: string;
      take?: number;
      skip?: number;
    }): Promise<{ postings: Posting[]; total: number; fitCohortSize: number | null }> => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "") as [
        string,
        string,
      ][];
      const q = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
      const res = await fetch(`${BASE}/postings${q ? `?${q}` : ""}`, {
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        let message = `GET /postings failed: ${res.status}`;
        let details: unknown;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
          details = body?.details;
        } catch {
          // response body wasn't JSON — fall back to the generic message above
        }
        throw new ApiError(res.status, message, details);
      }
      const postings = (await res.json()) as Posting[];
      const total = Number(res.headers.get("X-Total-Count") ?? postings.length);
      // Only present when a CandidateProfile exists (see postings.ts) — the size of the cohort
      // percentiles were normalized against, surfaced so the UI can explain "ranked against N
      // postings in this view" (the fit-percentile-varies-by-cohort tooltip).
      const cohortSizeHeader = res.headers.get("X-Fit-Cohort-Size");
      const fitCohortSize = cohortSizeHeader !== null ? Number(cohortSizeHeader) : null;
      return { postings, total, fitCohortSize };
    },
    get: (id: string) => request<Posting>(`/postings/${id}`),
    organizations: () => request<string[]>("/postings/organizations"),
    facets: () =>
      request<{
        seniorities: string[];
        workModes: string[];
        regions: string[];
        mlbTeamCounts: { true: number; false: number };
        sourceSectionCounts: Record<string, number>;
        internshipCounts: { true: number; false: number };
        allActiveCount: number;
        sourceTypes: string[];
      }>("/postings/facets"),
    approve: (id: string) => request<Application>(`/postings/${id}/approve`, { method: "POST" }),
    remove: (id: string) => request<void>(`/postings/${id}`, { method: "DELETE" }),
    update: (id: string, data: Partial<{ duplicateRejected: boolean; dismissedAt: string | null }>) =>
      request<Posting>(`/postings/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    createManual: (data: {
      title: string;
      organization: string;
      location?: string;
      url: string;
      description?: string;
      category?: string;
    }) => request<Posting>("/postings/manual", { method: "POST", body: JSON.stringify(data) }),
  },
  applications: {
    list: () => request<Application[]>("/applications"),
    update: (
      id: string,
      data: Partial<{
        stage: ApplicationStage;
        order: number;
        resumeDocId: string | null;
        coverDocId: string | null;
        notes: string;
        appliedAt: string;
      }>
    ) => request<Application>(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/applications/${id}`, { method: "DELETE" }),
    prepContext: (id: string) => request<PrepContext>(`/applications/${id}/prep-context`),
    applyPack: (id: string) => request<ApplyPack>(`/applications/${id}/apply-pack`),
    // Not fetched via `request()` — this is a plain URL for a <a href>/download link and for
    // building the bookmarklet client-side; the browser (or the user's userscript manager) loads
    // it directly, same-origin, same allowlisted-CORS story as documents.fileUrl above.
    applyAssistScriptUrl: (id: string) => `/api/applications/${id}/apply-assist-script`,
  },
  documents: {
    list: (kind?: "resume" | "cover_letter") =>
      request<Document[]>(`/documents${kind ? `?kind=${kind}` : ""}`),
    get: (id: string) => request<DocumentDetail>(`/documents/${id}`),
    create: (data: { kind: string; label: string; filePath: string; isBaseTemplate?: boolean }) =>
      request<Document>("/documents", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
    scan: () => request<{ inserted: number; skipped: number }>("/documents/scan", { method: "POST" }),
    fileUrl: (id: string, download = false) => `/api/documents/${id}/file${download ? "?download=1" : ""}`,
  },
  analytics: {
    summary: (params?: { from?: string; to?: string; category?: string; isMlbTeam?: boolean }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined) as [string, string][];
      const q = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
      return request<AnalyticsSummary>(`/analytics/summary${q ? `?${q}` : ""}`);
    },
    timeseries: (params?: { weeks?: number }) => {
      const q = params?.weeks ? `?weeks=${params.weeks}` : "";
      return request<AnalyticsTimeseries>(`/analytics/timeseries${q}`);
    },
    funnel: () => request<AnalyticsFunnel>("/analytics/funnel"),
    market: () => request<AnalyticsMarket>("/analytics/market"),
  },
  notifications: {
    list: () => request<{ id: string; summary: string; createdAt: string }[]>("/notifications"),
    generate: () =>
      request<{ id: string; summary: string; createdAt: string }>("/notifications/summary", { method: "POST" }),
  },
  resumeBullets: {
    list: (params?: { category?: string; isActive?: boolean }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined) as [string, string][];
      const q = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
      return request<ResumeBullet[]>(`/resume-bullets${q ? `?${q}` : ""}`);
    },
  },
  profile: {
    get: () => request<CandidateProfile | null>("/profile"),
    update: (data: CandidateProfileInput) =>
      request<CandidateProfile>("/profile", { method: "PUT", body: JSON.stringify(data) }),
    coverage: () => request<ProfileCoverage>("/profile/coverage"),
    previewCoverage: (draft: CandidateProfileInput) =>
      request<ProfileCoverage>("/profile/coverage/preview", { method: "POST", body: JSON.stringify(draft) }),
  },
  savedSearches: {
    list: () => request<SavedSearch[]>("/saved-searches"),
    create: (data: { name: string; query: string; isDefault?: boolean }) =>
      request<SavedSearch>("/saved-searches", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ name: string; query: string; isDefault: boolean }>) =>
      request<SavedSearch>(`/saved-searches/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/saved-searches/${id}`, { method: "DELETE" }),
  },
  // ApplicantIdentity singleton + nested EducationEntry CRUD — see api/src/routes/identity.ts.
  identity: {
    get: () => request<ApplicantIdentity | null>("/identity"),
    update: (data: ApplicantIdentityInput) =>
      request<ApplicantIdentity>("/identity", { method: "PUT", body: JSON.stringify(data) }),
    education: {
      list: () => request<EducationEntry[]>("/identity/education"),
      create: (data: EducationEntryInput) =>
        request<EducationEntry>("/identity/education", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: EducationEntryInput) =>
        request<EducationEntry>(`/identity/education/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      remove: (id: string) => request<void>(`/identity/education/${id}`, { method: "DELETE" }),
    },
  },
  // AnswerSnippet + AnswerOverride CRUD — see api/src/routes/answers.ts.
  answers: {
    snippets: {
      list: (params?: { category?: string }) => {
        const q = params?.category ? `?category=${encodeURIComponent(params.category)}` : "";
        return request<AnswerSnippet[]>(`/answers/snippets${q}`);
      },
      create: (data: AnswerSnippetInput) =>
        request<AnswerSnippet>("/answers/snippets", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: AnswerSnippetInput) =>
        request<AnswerSnippet>(`/answers/snippets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      remove: (id: string) => request<void>(`/answers/snippets/${id}`, { method: "DELETE" }),
    },
    overrides: {
      list: (params?: { applicationId?: string }) => {
        const q = params?.applicationId ? `?applicationId=${encodeURIComponent(params.applicationId)}` : "";
        return request<AnswerOverride[]>(`/answers/overrides${q}`);
      },
      create: (data: AnswerOverrideInput) =>
        request<AnswerOverride>("/answers/overrides", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: Partial<AnswerOverrideInput>) =>
        request<AnswerOverride>(`/answers/overrides/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      remove: (id: string) => request<void>(`/answers/overrides/${id}`, { method: "DELETE" }),
    },
  },
  tonePresets: {
    list: () => request<TonePreset[]>("/tone-presets"),
    create: (data: TonePresetInput) =>
      request<TonePreset>("/tone-presets", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: TonePresetInput) =>
      request<TonePreset>(`/tone-presets/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/tone-presets/${id}`, { method: "DELETE" }),
  },
  orgProfiles: {
    list: () => request<OrgProfile[]>("/org-profiles"),
    get: (organizationName: string) =>
      request<OrgProfile>(`/org-profiles/${encodeURIComponent(organizationName)}`),
    create: (data: OrgProfileInput) =>
      request<OrgProfile>("/org-profiles", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: OrgProfileInput) =>
      request<OrgProfile>(`/org-profiles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/org-profiles/${id}`, { method: "DELETE" }),
  },
};
