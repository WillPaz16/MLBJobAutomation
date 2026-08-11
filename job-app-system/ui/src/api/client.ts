import type { AnalyticsSummary, Application, ApplicationStage, Document, Posting } from "./types";

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
    list: (params?: {
      category?: string;
      location?: string;
      q?: string;
      source?: string;
      status?: "active" | "closed" | "all";
      sort?: "discoveredAt_desc" | "discoveredAt_asc" | "postedAt_desc" | "postedAt_asc";
      hideDuplicates?: boolean;
      take?: number;
      skip?: number;
    }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== "") as [
        string,
        string,
      ][];
      const q = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
      return request<Posting[]>(`/postings${q ? `?${q}` : ""}`);
    },
    approve: (id: string) => request<Application>(`/postings/${id}/approve`, { method: "POST" }),
    remove: (id: string) => request<void>(`/postings/${id}`, { method: "DELETE" }),
    update: (id: string, data: Partial<{ duplicateRejected: boolean }>) =>
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
  },
  notifications: {
    list: () => request<{ id: string; summary: string; createdAt: string }[]>("/notifications"),
    generate: () =>
      request<{ id: string; summary: string; createdAt: string }>("/notifications/summary", { method: "POST" }),
  },
};
