import { describe, expect, it } from "vitest";
import {
  scoreField,
  assignFields,
  matchOptionLabel,
  isSensitiveField,
  TARGET_FIELDS,
  FILL_THRESHOLD,
  FLAG_THRESHOLD,
} from "../src/applyAssist/fieldMatcherCore.js";

const firstNameTarget = TARGET_FIELDS.find((t) => t.key === "legalFirstName")!;
const emailTarget = TARGET_FIELDS.find((t) => t.key === "email")!;

describe("scoreField — threshold tiers", () => {
  it("scores an autocomplete match at 100 (fill tier)", () => {
    const score = scoreField({ autocomplete: "given-name" }, firstNameTarget);
    expect(score).toBe(100);
    expect(score).toBeGreaterThanOrEqual(FILL_THRESHOLD);
  });

  it("scores a name/id pattern match at 60 (fill tier)", () => {
    const score = scoreField({ name: "applicant_first_name" }, firstNameTarget);
    expect(score).toBe(60);
    expect(score).toBeGreaterThanOrEqual(FILL_THRESHOLD);
  });

  it("scores an exact label match at 50 (fill tier, boundary)", () => {
    const score = scoreField({ labelText: "First name" }, firstNameTarget);
    expect(score).toBe(50);
    expect(score).toBeGreaterThanOrEqual(FILL_THRESHOLD);
  });

  it("scores a fuzzy label match at 30 (flag tier, not fill)", () => {
    const score = scoreField({ labelText: "Your legal first name here" }, firstNameTarget);
    expect(score).toBe(30);
    expect(score).toBeLessThan(FILL_THRESHOLD);
    expect(score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);
  });

  it("scores an aria-label match at 25 (flag tier)", () => {
    const score = scoreField({ ariaText: "First name" }, firstNameTarget);
    expect(score).toBe(25);
    expect(score).toBeLessThan(FILL_THRESHOLD);
    expect(score).toBeGreaterThanOrEqual(FLAG_THRESHOLD);
  });

  it("scores a placeholder-only match at 10 (below flag threshold — ignored)", () => {
    const score = scoreField({ placeholder: "First name" }, firstNameTarget);
    expect(score).toBe(10);
    expect(score).toBeLessThan(FLAG_THRESHOLD);
  });

  it("scores 0 for a totally unrelated field", () => {
    const score = scoreField({ name: "shoe_size", labelText: "Shoe size" }, firstNameTarget);
    expect(score).toBe(0);
  });

  it("takes the single highest applicable signal, not a sum", () => {
    // autocomplete + name + label all match email — should still be exactly 100, not additive.
    const score = scoreField(
      { autocomplete: "email", name: "email_address", labelText: "Email" },
      emailTarget
    );
    expect(score).toBe(100);
  });
});

describe("assignFields — greedy one-to-one assignment", () => {
  it("fills fields scoring >= 50, flags 20-49, ignores <20, one target per field", () => {
    const descriptors = [
      { autocomplete: "given-name", name: "", id: "" }, // -> legalFirstName, fill (100)
      { autocomplete: "email", name: "", id: "" }, // -> email, fill (100)
      { labelText: "Your first name, informally" }, // fuzzy dup of first-name label -> flag, but target taken
      { placeholder: "First name" }, // low-signal, below flag threshold
    ];
    const assignments = assignFields(descriptors, TARGET_FIELDS);

    const byIndex = new Map(assignments.map((a) => [a.fieldIndex, a]));
    expect(byIndex.get(0)?.tier).toBe("fill");
    expect(byIndex.get(0)?.targetKey).toBe("legalFirstName");
    expect(byIndex.get(1)?.tier).toBe("fill");
    expect(byIndex.get(1)?.targetKey).toBe("email");
    // field 2 fuzzy-matches legalFirstName too, but that target is already used by field 0 —
    // greedy assignment must not double-assign the same target to two fields.
    expect(byIndex.get(2)?.targetKey).not.toBe("legalFirstName");
  });

  it("never assigns the same field to two targets", () => {
    const descriptors = [{ autocomplete: "given-name" }];
    const assignments = assignFields(descriptors, TARGET_FIELDS);
    const forField0 = assignments.filter((a) => a.fieldIndex === 0);
    expect(forField0.length).toBeLessThanOrEqual(1);
  });

  it("excludes sensitive fields from scoring entirely", () => {
    const descriptors = [{ type: "password", name: "password", autocomplete: "given-name" }];
    const assignments = assignFields(descriptors, TARGET_FIELDS);
    expect(assignments).toHaveLength(0);
  });
});

describe("isSensitiveField", () => {
  it("flags by type attribute", () => {
    expect(isSensitiveField({ type: "password" })).toBe(true);
    expect(isSensitiveField({ type: "hidden" })).toBe(true);
    expect(isSensitiveField({ type: "file" })).toBe(true);
    expect(isSensitiveField({ type: "text" })).toBe(false);
  });

  it("flags by name/id pattern even when type is generic text", () => {
    expect(isSensitiveField({ type: "text", name: "ssn_number" })).toBe(true);
    expect(isSensitiveField({ type: "text", id: "credit-card-number" })).toBe(true);
    expect(isSensitiveField({ type: "text", name: "cvv" })).toBe(true);
    expect(isSensitiveField({ type: "text", name: "routing_number" })).toBe(true);
    expect(isSensitiveField({ type: "text", name: "bank_account_number" })).toBe(true);
  });

  it("does not flag an ordinary text field", () => {
    expect(isSensitiveField({ type: "text", name: "first_name" })).toBe(false);
  });
});

describe("matchOptionLabel — EEO/select token-overlap matching", () => {
  it("matches an exact option text", () => {
    const options = ["Please select", "Male", "Female", "Decline to answer"];
    expect(matchOptionLabel(options, "Female")).toBe(2);
  });

  it("matches realistic differently-worded EEO option text via token overlap", () => {
    const options = [
      "-- Select --",
      "Yes, I have a disability (or previously had one)",
      "No, I do not have a disability",
      "I do not want to answer",
    ];
    // Stored label phrased slightly differently than the option's exact text.
    expect(matchOptionLabel(options, "Yes, I have a disability (or previously had one)")).toBe(1);
  });

  it("returns -1 when nothing clears the similarity threshold", () => {
    const options = ["Option A", "Option B"];
    expect(matchOptionLabel(options, "Completely unrelated stored value")).toBe(-1);
  });

  it("returns -1 for an empty stored label", () => {
    expect(matchOptionLabel(["Yes", "No"], "")).toBe(-1);
  });
});
