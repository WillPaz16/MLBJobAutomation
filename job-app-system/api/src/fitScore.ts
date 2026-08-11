// Deterministic keyword-based fit scoring, deliberately not ML/embedding-based (see CLAUDE.md's
// documented decision to defer semantic matching). Same haystack substring-matching style as
// scrapers/src/categorize.ts.

export interface FitScorePosting {
  title: string;
  organization: string;
  category?: string | null;
  location?: string | null;
  description?: string | null;
}

export interface FitScoreProfile {
  skills: string;
  preferredCategories?: string | null;
  locationKeywords?: string | null;
  excludeKeywords?: string | null;
}

export interface FitScoreResult {
  score: number;
  matchedSkills: string[];
}

function splitKeywords(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

export function computeFitScore(posting: FitScorePosting, profile: FitScoreProfile): FitScoreResult {
  const haystack = `${posting.title} ${posting.organization} ${posting.description ?? ""}`.toLowerCase();

  const skills = splitKeywords(profile.skills);
  const matchedSkills = skills.filter((skill) => haystack.includes(skill));

  let score = (matchedSkills.length / Math.max(1, skills.length)) * 100;

  const preferredCategories = splitKeywords(profile.preferredCategories);
  if (posting.category && preferredCategories.includes(posting.category.toLowerCase())) {
    score += 15;
  }

  const locationKeywords = splitKeywords(profile.locationKeywords);
  const location = (posting.location ?? "").toLowerCase();
  if (location && locationKeywords.some((kw) => location.includes(kw))) {
    score += 10;
  }

  const excludeKeywords = splitKeywords(profile.excludeKeywords);
  const excludeHits = excludeKeywords.filter((kw) => haystack.includes(kw));
  score -= excludeHits.length * 20;

  score = Math.round(Math.min(100, Math.max(0, score)));

  return { score, matchedSkills };
}
