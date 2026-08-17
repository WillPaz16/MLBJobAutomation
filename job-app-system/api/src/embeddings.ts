// Local-only embedding client (Ollama). See CLAUDE.md: semantic matching was explicitly deferred
// pending a local model rather than a paid API — this is that model. Best-effort by design:
// callers must catch/ignore failures rather than let a missing/unreachable Ollama server block
// ingestion or profile saves (fitScore.ts's semantic term already treats a missing embedding as a
// no-op, not a penalty).

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

// nomic-embed-text's context window is 2048 tokens — a real job description (often HTML-entity-
// heavy, e.g. "&lt;p&gt;") can exceed that and the request 500s outright rather than truncating
// server-side (confirmed live: "the input length exceeds the context length"). A skill/profile
// summary is a rough proxy for the posting's substance anyway, so truncating client-side to a
// conservative character budget is a reasonable tradeoff, not a meaningful accuracy loss.
const MAX_PROMPT_CHARS = 3000;

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_EMBED_MODEL, prompt: text.slice(0, MAX_PROMPT_CHARS) }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embeddings request failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
