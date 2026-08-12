export interface NormalizedPosting {
  externalId: string;
  title: string;
  organization: string;
  location?: string;
  category: "BASEBALL_OPS" | "BASEBALL_ANALYTICS" | "BASEBALL_RND" | "DATA_SCIENCE" | "OTHER";
  url: string;
  description?: string;
  salary?: string; // raw text, only when a source happens to expose it — display-only, never parsed
  postedAt?: Date;
  // Exact section header text a posting came from, for adapters that track sub-sections within
  // one source (currently only jobListRepo.ts). Undefined for every other adapter.
  sourceSection?: string;
}

export interface Adapter {
  sourceName: string;
  sourceType: string;
  fetchPostings(config: Record<string, any>): Promise<NormalizedPosting[]>;
}
