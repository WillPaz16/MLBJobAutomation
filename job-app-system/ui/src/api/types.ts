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
  educationRequirement: string | null;
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

// A single resolved answer entry — see api/src/routes/applications.ts's computeResolvedAnswers.
export interface ResolvedAnswer {
  snippetId: string | null;
  category: string | null;
  question: string | null;
  questionKey: string | null;
  source: "snippet" | "override";
  text: string;
  unresolved: string[];
}

// GET /api/applications/:id/prep-context response shape.
export interface PrepContext {
  application: Application;
  orgProfile: { id: string; organizationName: string; notes: string | null; preferredToneId: string | null } | null;
  tonePreset: { id: string; name: string; guidance: string; isDefault: boolean } | null;
  resumeBullets: ResumeBullet[];
  resolvedAnswers: ResolvedAnswer[];
}

// GET /api/applications/:id/apply-pack response shape — the only endpoint that returns
// ApplicantIdentity PII (see CLAUDE.md / v8 Phase 4's two-sensitivity-levels note).
export interface ApplyPack {
  application: Application;
  identity: ApplicantIdentity | null;
  resolvedAnswers: ResolvedAnswer[];
}

export interface EducationEntry {
  id: string;
  applicantIdentityId: string;
  school: string | null;
  degree: string | null;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  gpa: string | null;
  isPrimary: boolean;
}

export interface ApplicantIdentity {
  id: string;
  legalFirstName: string | null;
  legalMiddleName: string | null;
  legalLastName: string | null;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  addressCountry: string | null;
  dateOfBirth: string | null;
  requiresSponsorship: boolean | null;
  authorizedToWorkUs: boolean | null;
  genderIdentityCode: string | null;
  genderIdentityLabel: string | null;
  raceEthnicityCode: string | null;
  raceEthnicityLabel: string | null;
  disabilityStatusCode: string | null;
  disabilityStatusLabel: string | null;
  veteranStatusCode: string | null;
  veteranStatusLabel: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
  otherUrl: string | null;
  updatedAt: string;
  education?: EducationEntry[];
}

// Reuses the PUT body shape — every field optional/nullable, matching putApplicantIdentitySchema.
export type ApplicantIdentityInput = Partial<Omit<ApplicantIdentity, "id" | "updatedAt" | "education">>;

export type EducationEntryInput = Partial<Omit<EducationEntry, "id" | "applicantIdentityId">>;

export interface AnswerSnippet {
  id: string;
  category: string;
  question: string;
  template: string;
  tags: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AnswerSnippetInput = Partial<Omit<AnswerSnippet, "id" | "createdAt" | "updatedAt">>;

export interface AnswerOverride {
  id: string;
  applicationId: string;
  questionKey: string;
  answer: string;
  snippetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AnswerOverrideInput = {
  applicationId: string;
  questionKey: string;
  answer: string;
  snippetId?: string | null;
};

export interface TonePreset {
  id: string;
  name: string;
  guidance: string;
  isDefault: boolean;
}

export type TonePresetInput = Partial<Omit<TonePreset, "id">>;

export interface OrgProfile {
  id: string;
  organizationName: string;
  notes: string | null;
  preferredToneId: string | null;
  preferredTone?: TonePreset | null;
}

export type OrgProfileInput = Partial<Omit<OrgProfile, "id" | "preferredTone">> & {
  organizationName?: string;
};

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
  dismissalBreakdown: {
    category: BarListEntry[];
  };
  fitScoreByCohort: {
    dismissed: StageStats;
    applied: StageStats;
    other: StageStats;
  };
}

// Shared response shape for both GET /api/profile/coverage and POST /api/profile/coverage/preview
// — see api/src/routes/profile.ts's computeCoverage for exactly how each field is derived.
export interface ProfileCoverage {
  totalPostings: number;
  skills: { term: string; tier: "core" | "secondary"; postings: number; occurrences: number }[];
  fitScores: number[];
  tierCounts: { Strong: number; Good: number; Fair: number; Weak: number };
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
