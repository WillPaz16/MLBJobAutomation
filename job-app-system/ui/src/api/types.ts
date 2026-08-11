export type PostingCategory =
  | "BASEBALL_OPS"
  | "BASEBALL_ANALYTICS"
  | "BASEBALL_RND"
  | "DATA_SCIENCE"
  | "OTHER";

export type ApplicationStage =
  | "FOUND"
  | "REVIEWING"
  | "APPLIED"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "WITHDRAWN";

export interface Source {
  id: string;
  name: string;
  type: string;
}

export interface Posting {
  id: string;
  sourceId: string;
  source: Source;
  externalId: string;
  title: string;
  organization: string;
  location: string | null;
  category: PostingCategory;
  url: string;
  description: string | null;
  postedAt: string | null;
  discoveredAt: string;
  lastSeenAt: string;
  closedAt: string | null;
  missedRuns: number;
  possibleDuplicateOfId: string | null;
  possibleDuplicateOf?: Posting | null;
  duplicateRejected: boolean;
  dismissedAt: string | null;
  applications: Application[];
}

export interface Document {
  id: string;
  kind: "resume" | "cover_letter";
  label: string;
  filePath: string;
  isBaseTemplate: boolean;
  createdAt: string;
}

export interface Application {
  id: string;
  postingId: string;
  posting?: Posting;
  stage: ApplicationStage;
  order: number;
  resumeDocId: string | null;
  resumeDoc?: Document | null;
  coverDocId: string | null;
  coverDoc?: Document | null;
  notes: string | null;
  appliedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface AnalyticsSummary {
  total: number;
  byStage: Record<string, number>;
  bySource: Record<string, number>;
  avgResponseDays: number | null;
  avgResponseDaysByStage: Record<string, number>;
}
