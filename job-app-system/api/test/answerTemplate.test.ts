import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../src/answerTemplate.js";

describe("resolveTemplate", () => {
  it("resolves known placeholders", () => {
    const { text, unresolved } = resolveTemplate("I want to work at {{org}} as a {{role}}.", {
      org: "Chicago Cubs",
      role: "Data Analyst",
      orgNotes: "great culture",
    });
    expect(text).toBe("I want to work at Chicago Cubs as a Data Analyst.");
    expect(unresolved).toEqual([]);
  });

  it("leaves unknown placeholders verbatim and reports them", () => {
    const { text, unresolved } = resolveTemplate("Ask {{teamLead}} about {{org}}.", {
      org: "Cubs",
    });
    expect(text).toBe("Ask {{teamLead}} about Cubs.");
    expect(unresolved).toEqual(["teamLead"]);
  });

  it("treats a known placeholder with no value as unresolved, not blank", () => {
    const { text, unresolved } = resolveTemplate("Notes: {{orgNotes}}.", { org: "Cubs" });
    expect(text).toBe("Notes: {{orgNotes}}.");
    expect(unresolved).toEqual(["orgNotes"]);
  });

  it("dedupes repeated unresolved placeholders", () => {
    const { unresolved } = resolveTemplate("{{x}} and {{x}} again", {});
    expect(unresolved).toEqual(["x"]);
  });
});
