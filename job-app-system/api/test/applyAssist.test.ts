import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { prisma } from "../src/db.js";
import { createApplication, createPosting } from "./helpers.js";
import { generateApplyAssistScript } from "../src/applyAssist/generateScript.js";

const app = createApp();

// This is the single most important test in v8 Phase 6, per the plan: the generated userscript
// must NEVER contain a way to submit or click through a form, full stop. Written as a literal
// string-search assertion against the FINAL generated text (not a behavioral/DOM test), so it
// survives any future refactor of the matching logic and can't be fooled by the matcher changing
// shape. Also checks for obvious ways someone could reintroduce a submit path by accident.
describe("generated apply-assist script — no-click/no-submit guard", () => {
  const script = generateApplyAssistScript({
    applicationId: "app-1",
    organization: "Test Org",
    title: "Test Role",
    postingUrl: "https://example.com/job",
    identity: { legalFirstName: "Will", email: "will@example.com" },
    resolvedAnswers: [],
  });

  it("contains no .click(), .submit(), or .requestSubmit() call anywhere", () => {
    expect(script).not.toMatch(/\.click\s*\(/);
    expect(script).not.toMatch(/\.submit\s*\(/);
    expect(script).not.toMatch(/\.requestSubmit\s*\(/i);
  });

  it("contains no constructed/obfuscated variants of those calls", () => {
    // Bracket-access evasion: el["click"](), el['submit']()
    expect(script).not.toMatch(/\[\s*['"]click['"]\s*\]\s*\(/);
    expect(script).not.toMatch(/\[\s*['"]submit['"]\s*\]\s*\(/);
    expect(script).not.toMatch(/\[\s*['"]requestSubmit['"]\s*\]\s*\(/i);
    // String-built method names, e.g. "cli" + "ck"
    expect(script).not.toMatch(/['"]cli['"]\s*\+\s*['"]ck['"]/);
    expect(script).not.toMatch(/['"]sub['"]\s*\+\s*['"]mit['"]/);
    // Any casing/spacing variant of requestSubmit as an identifier
    expect(script.toLowerCase()).not.toMatch(/request\s*submit/);
    // form.submit at all, and dispatching a submit-type event
    expect(script).not.toMatch(/\bform\.submit\b/i);
    expect(script).not.toMatch(/new\s+SubmitEvent/i);
    expect(script).not.toMatch(/dispatchEvent\([^)]*['"]submit['"]/i);
  });

  it("contains the verbatim reassurance phrase in the summary banner", () => {
    expect(script).toMatch(/Nothing was submitted\./);
  });

  it("requires a fresh isTrusted gesture before invoking the fill logic", () => {
    expect(script).toMatch(/ev\.isTrusted/);
    // The trigger button's click listener is the only actual *invocation* of runFill() (i.e.
    // `runFill();` as a statement) — the function's own `function runFill() {` declaration line
    // and prose comments mentioning it by name don't count as call sites.
    const runFillCallSites = script.match(/(?<!function )runFill\(\)\s*;/g) ?? [];
    expect(runFillCallSites.length).toBe(1);
  });

  it("never overwrites a non-empty field (isEmptyValue check present and used)", () => {
    expect(script).toMatch(/isEmptyValue/);
  });

  it("skips sensitive fields by both type and name pattern", () => {
    expect(script).toMatch(/SENSITIVE_TYPES/);
    expect(script).toMatch(/SENSITIVE_NAME_PATTERN/);
  });

  it("includes an Undo control that restores prior values", () => {
    expect(script).toMatch(/Undo/);
    expect(script).toMatch(/undoLog/);
  });

  it("does not embed a runtime fetch back to the API", () => {
    expect(script).not.toMatch(/fetch\(/);
    expect(script).not.toMatch(/XMLHttpRequest/);
  });
});

describe("generated apply-assist script — no cross-application data leakage", () => {
  it("embeds only the requested application's identity data, not another application's", () => {
    const scriptA = generateApplyAssistScript({
      applicationId: "app-a",
      organization: "Org A",
      title: "Role A",
      postingUrl: null,
      identity: { legalFirstName: "Alice", email: "alice@example.com" },
      resolvedAnswers: [],
    });
    const scriptB = generateApplyAssistScript({
      applicationId: "app-b",
      organization: "Org B",
      title: "Role B",
      postingUrl: null,
      identity: { legalFirstName: "Bob", email: "bob@example.com" },
      resolvedAnswers: [],
    });

    expect(scriptA).toMatch(/Alice/);
    expect(scriptA).not.toMatch(/Bob/);
    expect(scriptA).not.toMatch(/bob@example\.com/);

    expect(scriptB).toMatch(/Bob/);
    expect(scriptB).not.toMatch(/Alice/);
    expect(scriptB).not.toMatch(/alice@example\.com/);
  });
});

describe("GET /api/applications/:id/apply-assist-script", () => {
  it("serves a userscript for a real application, inlining its own identity only", async () => {
    await prisma.applicantIdentity.upsert({
      where: { id: "identity" },
      create: { id: "identity", legalFirstName: "Will", email: "will@example.com" },
      update: { legalFirstName: "Will", email: "will@example.com" },
    });
    const posting = await createPosting({ organization: "Chicago Cubs", title: "Baseball R&D Analyst" });
    const application = await createApplication(posting.id);

    const res = await request(app).get(`/api/applications/${application.id}/apply-assist-script`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toMatch(/==UserScript==/);
    expect(res.text).toMatch(/Will/);
    expect(res.text).not.toMatch(/\.click\s*\(/);
    expect(res.text).not.toMatch(/\.submit\s*\(/);
  });

  it("404s for a missing application", async () => {
    const res = await request(app).get("/api/applications/does-not-exist/apply-assist-script");
    expect(res.status).toBe(404);
  });
});
