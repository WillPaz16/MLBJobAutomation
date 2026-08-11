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
}

export interface Adapter {
  sourceName: string;
  sourceType: string;
  fetchPostings(config: Record<string, any>): Promise<NormalizedPosting[]>;
}
