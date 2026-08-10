// Cross-source duplicate detection. `ingestPostings`'s exact sourceId+externalId key only catches
// the same source posting the same job twice — it can't catch the same job posted to two
// different sources under different IDs and slightly different title text (e.g. an org posting
// the same role to both TeamWork Online and Dayforce, worded differently on each platform). This
// does fuzzy title matching, scoped to postings from the same organization, as a second pass.
const STOPWORDS = new Set(["and", "the", "of", "a", "an", "for", "to", "in", "at", "on", "&"]);

// Tuned against a real observed pair: Dayforce's "Coordinator-Community Partnerships and
// Events-UYA" vs TeamWork Online's "Urban Youth Academy – Coordinator, Community Partnerships and
// Events" for the same Royals role — token overlap of 4/8 = 0.5. Both thresholds matter: Jaccard
// alone would false-match short generic titles ("Ticket Sales Associate" vs "Ticket Sales
// Representative" is already 0.5), so also require a minimum number of shared meaningful words.
const SIMILARITY_THRESHOLD = 0.5;
const MIN_SHARED_TOKENS = 3;

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 0 && !STOPWORDS.has(word))
  );
}

export function isLikelyDuplicateTitle(titleA: string, titleB: string): boolean {
  const tokensA = titleTokens(titleA);
  const tokensB = titleTokens(titleB);
  const shared = [...tokensA].filter((token) => tokensB.has(token));
  if (shared.length < MIN_SHARED_TOKENS) return false;

  const union = new Set([...tokensA, ...tokensB]);
  return shared.length / union.size >= SIMILARITY_THRESHOLD;
}
