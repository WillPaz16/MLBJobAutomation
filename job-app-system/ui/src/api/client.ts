import type { AnalyticsSummary, Application, ApplicationStage, Document, Posting } from "./types";

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`${options?.method ?? "GET"} ${path} failed: ${res.status}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  postings: {
    list: (params?: { category?: string; location?: string }) => {
      const entries = Object.entries(params ?? {}).filter(([, v]) => v) as [string, string][];
      const q = new URLSearchParams(entries).toString();
      return request<Posting[]>(`/postings${q ? `?${q}` : ""}`);
    },
    approve: (id: string) => request<Application>(`/postings/${id}/approve`, { method: "POST" }),
  },
  applications: {
    list: () => request<Application[]>("/applications"),
    update: (
      id: string,
      data: Partial<{ stage: ApplicationStage; resumeDocId: string; coverDocId: string; notes: string; appliedAt: string }>
    ) => request<Application>(`/applications/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    remove: (id: string) => request<void>(`/applications/${id}`, { method: "DELETE" }),
  },
  documents: {
    list: (kind?: "resume" | "cover_letter") =>
      request<Document[]>(`/documents${kind ? `?kind=${kind}` : ""}`),
    create: (data: { kind: string; label: string; filePath: string; isBaseTemplate?: boolean }) =>
      request<Document>("/documents", { method: "POST", body: JSON.stringify(data) }),
  },
  analytics: {
    summary: () => request<AnalyticsSummary>("/analytics/summary"),
  },
  notifications: {
    list: () => request<{ id: string; summary: string; createdAt: string }[]>("/notifications"),
    generate: () => request<{ id: string; summary: string; createdAt: string }>("/notifications/summary", { method: "POST" }),
  },
};
