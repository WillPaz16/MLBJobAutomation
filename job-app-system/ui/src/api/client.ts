import type {
  AnalyticsSummary,
  AnalyticsTimeseries,
  Application,
  ApplicationStage,
  CandidateProfile,
  CandidateProfileInput,
  Document,
  Posting,
  ProfileCoverage,
  ResumeBullet,
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
      take?: number;
      skip?: number;
    }): Promise<{ postings: Posting[]; total: number }> => {
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
      return { postings, total };
    },
    organizations: () => request<string[]>("/postings/organizations"),
    facets: () =>
      request<{
        seniorities: string[];
        workModes: string[];
        regions: string[];
        mlbTeamCounts: { true: number; false: number };
        sourceSectionCounts: Record<string, number>;
        internshipCounts: { true: number; false: number };
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
        resumeDocId: string;
        coverDocId: string;
        notes: string;
        appliedAt: string;
      }>
    ) => request<Application>(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/applications/${id}`, { method: "DELETE" }),
  },
  documents: {
    list: (kind?: "resume" | "cover_letter") =>
      request<Document[]>(`/documents${kind ? `?kind=${kind}` : ""}`),
    create: (data: { kind: string; label: string; filePath: string; isBaseTemplate?: boolean }) =>
      request<Document>("/documents", { method: "POST", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  },
  analytics: {
    summary: () => request<AnalyticsSummary>("/analytics/summary"),
    timeseries: () => request<AnalyticsTimeseries>("/analytics/timeseries"),
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
};
