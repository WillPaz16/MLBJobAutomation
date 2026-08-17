// Curated candidate-skill vocabulary for the "skill gap" feature (api/src/routes/profile.ts's
// computeCoverage) — deliberately a hand-maintained list, not extracted from posting text. This
// codebase's whole scoring/classification philosophy is deterministic keyword matching, not NLP
// (categorize.ts, seniority.ts, education.ts, and Compatibility.tsx's own DEFAULT_CORE_SKILLS/
// NON_POSTING_FACING_TAGS are all hand-curated lists too) — genuine open-vocabulary term
// extraction from posting text would surface mostly noise ("experience", "opportunity", "team"),
// which breaks that pattern rather than extending it. Short, posting-facing terms only, same
// "would a real job posting actually say this" bar as DEFAULT_CORE_SKILLS in Compatibility.tsx.
export const CANDIDATE_SKILL_VOCABULARY = [
  // Languages
  "python",
  "r",
  "sql",
  "java",
  "scala",
  "c++",
  "javascript",
  "typescript",
  "julia",
  // Data / ML libraries & frameworks
  "pandas",
  "numpy",
  "scikit-learn",
  "tensorflow",
  "pytorch",
  "keras",
  "xgboost",
  "spark",
  "hadoop",
  "airflow",
  "dbt",
  // Cloud / infra
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "snowflake",
  "databricks",
  "redshift",
  "bigquery",
  // Visualization / BI
  "tableau",
  "power bi",
  "looker",
  "plotly",
  "r shiny",
  "excel",
  "vba",
  // Core methods
  "machine learning",
  "deep learning",
  "natural language processing",
  "computer vision",
  "statistics",
  "regression",
  "classification",
  "clustering",
  "time series",
  "bayesian",
  "causal inference",
  "experimental design",
  "a/b testing",
  "optimization",
  "simulation",
  "forecasting",
  "econometrics",
  // Tools
  "git",
  "github",
  "jira",
  "linux",
  // Baseball / sports-analytics specific
  "sabermetrics",
  "biomechanics",
  "statcast",
  "pitch design",
  "player development",
  "scouting",
  "sports science",
] as const;
