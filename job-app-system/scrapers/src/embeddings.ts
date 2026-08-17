// Mirrored from api/src/embeddings.ts (scrapers/ and api/ are independent packages with no
// cross-import, same convention as the dual-synced prisma/schema.prisma files) — keep both copies
// in sync if either changes. See the api copy for the full rationale (CLAUDE.md's local-model
// decision, best-effort-not-blocking design).

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";

// nomic-embed-text's context window is 2048 tokens — a real job description (often HTML-entity-
// heavy, e.g. "&lt;p&gt;") can exceed that and the request 500s outright rather than truncating
// server-side (confirmed live: "the input length exceeds the context length"). Mirrors
// api/src/embeddings.ts's MAX_PROMPT_CHARS — keep both in sync if either changes.
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
