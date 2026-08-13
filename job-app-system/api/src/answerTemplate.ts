// Small, pure, independently-testable templating module for AnswerSnippet/AnswerOverride
// resolution (v8 Phase 4). Supports {{org}}, {{role}}, {{orgNotes}} placeholders resolved
// server-side. Unknown/unresolvable placeholders are left VERBATIM in the output and reported
// separately in `unresolved` — never silently blanked. A visible `{{teamLead}}` left in the text
// is correctable by the human reviewing it before it goes into a real application; a silently
// blanked one ships a broken sentence unnoticed.

export interface TemplateContext {
  org?: string | null;
  role?: string | null;
  orgNotes?: string | null;
}

export interface ResolvedTemplate {
  text: string;
  unresolved: string[];
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Resolves {{placeholder}} tokens in `template` against `context`. Recognized keys: org, role,
 * orgNotes. A recognized key whose context value is null/undefined is treated as unresolved (left
 * verbatim) rather than replaced with an empty string — same "never silently blank" rule applies
 * whether the placeholder is unknown or just has no value yet.
 */
export function resolveTemplate(template: string, context: TemplateContext): ResolvedTemplate {
  const unresolved = new Set<string>();

  const knownValues: Record<string, string | null | undefined> = {
    org: context.org,
    role: context.role,
    orgNotes: context.orgNotes,
  };

  const text = template.replace(PLACEHOLDER_RE, (match, key: string) => {
    if (!(key in knownValues)) {
      unresolved.add(key);
      return match;
    }
    const value = knownValues[key];
    if (value === null || value === undefined || value === "") {
      unresolved.add(key);
      return match;
    }
    return value;
  });

  return { text, unresolved: Array.from(unresolved) };
}
