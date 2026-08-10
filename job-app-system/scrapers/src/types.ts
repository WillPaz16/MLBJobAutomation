export interface NormalizedPosting {
  externalId: string;
  title: string;
  organization: string;
  location?: string;
  category: "BASEBALL_OPS" | "BASEBALL_ANALYTICS" | "BASEBALL_RND" | "DATA_SCIENCE" | "OTHER";
  url: string;
  description?: string;
  postedAt?: Date;
}

export interface Adapter {
  sourceName: string;
  sourceType: string;
  fetchPostings(config: Record<string, any>): Promise<NormalizedPosting[]>;
}
