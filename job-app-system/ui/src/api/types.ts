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
  isInternship: boolean;
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
  storageKey: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  sourcePath: string | null;
  // Present on GET /api/documents (list) and GET /api/documents/:id.
  exists?: boolean;
}

export interface DocumentUsage {
  applicationId: string;
  role: "resume" | "cover";
  postingTitle: string;
  organization: string;
  stage: ApplicationStage;
}

export interface DocumentDetail extends Document {
  usedBy: DocumentUsage[];
}

// GET /api/applications/:id/prep-context response shape.
export interface PrepContext {
  application: Application;
  orgProfile: { id: string; organizationName: string; notes: string | null; preferredToneId: string | null } | null;
  tonePreset: { id: string; name: string; guidance: string; isDefault: boolean } | null;
  resumeBullets: ResumeBullet[];
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
}

// See api/src/routes/analytics.ts's GET /timeseries doc comment for the exact bucketing rules.
export interface AnalyticsTimeseries {
  weeks: string[];
  discovered: number[];
  applicationsCreated: number[];
  applied: number[];
  fitScores: number[];
}

export interface StageStats {
  median: number | null;
  mean: number | null;
  n: number;
}

// See api/src/routes/analytics.ts's GET /funnel doc comment for the exact shape/semantics
// (backfill-source events count toward reached/conversion but are excluded from duration math).
export interface AnalyticsFunnel {
  reached: Record<string, number>;
  conversion: Record<string, number | null>;
  daysInStage: Record<string, StageStats>;
  medianDaysToResponse: number | null;
  meanDaysToResponse: number | null;
  sampleSizes: { totalApplications: number; appliedReached: number; responseSampleSize: number };
}

export interface BarListEntry {
  key: string;
  label: string;
  value: number;
}

// See api/src/routes/analytics.ts's GET /market doc comment for the exact shape/semantics.
export interface AnalyticsMarket {
  timeToClose: {
    bucketLabels: string[];
    mlb: number[];
    nonMlb: number[];
    postedAtBasedCount: number;
    discoveredAtFallbackCount: number;
  };
  discoveryLag: StageStats;
  dismissalBreakdown: {
    category: BarListEntry[];
    seniority: BarListEntry[];
    workMode: BarListEntry[];
    region: BarListEntry[];
  };
  fitScoreByCohort: {
    dismissed: StageStats;
    applied: StageStats;
    other: StageStats;
  };
  supplyMix: {
    weeks: string[];
    active: number[];
    closed: number[];
    bySeniority: BarListEntry[];
    byWorkMode: BarListEntry[];
    byRegion: BarListEntry[];
    byMlbTeam: BarListEntry[];
  };
}

// Shared response shape for both GET /api/profile/coverage and POST /api/profile/coverage/preview
// — see api/src/routes/profile.ts's computeCoverage for exactly how each field is derived.
export interface ProfileCoverage {
  totalPostings: number;
  skills: { term: string; tier: "core" | "secondary"; postings: number; occurrences: number }[];
  fitScores: number[];
  tierCounts: { Strong: number; Good: number; Fair: number; Weak: number };
  categoryActivity: { category: string; applied: number; dismissed: number; total: number }[];
  calibration: {
    dismissedAvg: number | null;
    dismissedCount: number;
    appliedAvg: number | null;
    appliedCount: number;
  };
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  isDefault: boolean;
  createdAt: string;
}

// Reuses the exact shape `update`'s PUT body already accepts, per CLAUDE.md/plan convention of
// not inventing a second type for the same draft-profile payload.
export type CandidateProfileInput = {
  skills: string;
  coreSkills?: string;
  preferredCategories?: string;
  locationKeywords?: string;
  excludeKeywords?: string;
};
