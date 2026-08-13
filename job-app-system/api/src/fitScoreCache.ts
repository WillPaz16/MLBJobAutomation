// Per-posting raw-fit-score cache, keyed on posting.id (not the whole cohort). A raw fit score
// is cohort-independent — it only depends on the posting's own title/description/category/
// location and the profile's skills — so caching per-posting-id is simpler and correct here,
// unlike routes/analytics.ts's whole-array `fitScoreCache`, which has to key on cohort
// composition because it memoizes an already-normalized/aggregated array.
//
// Mirrors that analytics.ts precedent's invalidation shape: each entry stores the
// `profile.updatedAt` it was computed against, and a stale entry (profile has since changed) is
// simply recomputed and overwritten on next access — no need to proactively clear the whole map
// the moment the profile changes. `invalidatePostingFitScoreCache` additionally lets
// PATCH /api/postings/:id drop a single entry immediately when title/description/category (the
// only fields computeFitScore reads) change, so a stale score is never served after an edit.
//
// In-memory, per-process, not persisted — same accepted tradeoff as analytics.ts's cache.
import { computeFitScore, type FitScorePosting, type FitScoreProfile, type FitScoreResult } from "./fitScore.js";

interface CacheEntry {
  score: FitScoreResult;
  profileUpdatedAt: string;
}

const cache = new Map<string, CacheEntry>();

export function getCachedRawFitScore<T extends FitScorePosting & { id: string }>(
  posting: T,
  profile: FitScoreProfile,
  profileUpdatedAt: string
): FitScoreResult {
  const cached = cache.get(posting.id);
  if (cached && cached.profileUpdatedAt === profileUpdatedAt) {
    return cached.score;
  }
  const result = computeFitScore(posting, profile);
  cache.set(posting.id, { score: result, profileUpdatedAt });
  return result;
}

export function invalidatePostingFitScoreCache(id: string): void {
  cache.delete(id);
}
