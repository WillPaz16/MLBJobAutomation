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
  seniority: string | null;
  workMode: string | null;
  region: string | null;
  salary: string | null;
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
  isMlbTeam: boolean;
  sourceSection: string | null;
  applications: Application[];
  // Present only when a CandidateProfile exists — see api/src/fitScore.ts.
  fitScore?: number | null;
  fitScoreRaw?: number | null;
  fitTier?: string | null;
  matchedSkills?: string[] | null;
  reasons?: { kind: string; label: string; points: number }[] | null;
  evidence?: { term: string; excerpt: string }[] | null;
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

export interface ResumeBullet {
  id: string;
  category: string;
  text: string;
  tags: string | null;
  isActive: boolean;
}

export interface CandidateProfile {
  id: string;
  skills: string;
  coreSkills: string | null;
  preferredCategories: string | null;
  locationKeywords: string | null;
  excludeKeywords: string | null;
  updatedAt: string;
}

export interface AnalyticsSummary {
  total: number;
  byStage: Record<string, number>;
  bySource: Record<string, number>;
  avgResponseDays: number | null;
  avgResponseDaysByStage: Record<string, number>;
}

// See api/src/routes/analytics.ts's GET /timeseries doc comment for the exact bucketing rules.
export interface AnalyticsTimeseries {
  weeks: string[];
  discovered: number[];
  applicationsCreated: number[];
  applied: number[];
  fitScores: number[];
}
