import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "../src/lib/utils";

describe("htmlToPlainText", () => {
  it("decodes entities and strips tags", () => {
    expect(htmlToPlainText("<p>Research &amp; Development</p>")).toBe("Research & Development");
  });

  it("collapses runs of decoded &nbsp; into single spaces", () => {
    expect(htmlToPlainText("Job&nbsp;&nbsp;&nbsp;Title")).toBe("Job Title");
  });

  it("converts block-level closing tags and <br> into line breaks", () => {
    expect(htmlToPlainText("<p>First</p><p>Second</p>")).toBe("First\nSecond");
    expect(htmlToPlainText("Line one<br>Line two")).toBe("Line one\nLine two");
  });

  it("converts list items into dashed lines", () => {
    expect(htmlToPlainText("<ul><li>One</li><li>Two</li></ul>")).toBe("- One\n- Two");
  });

  it("collapses 3+ consecutive blank lines down to one blank line", () => {
    expect(htmlToPlainText("<p>A</p><p></p><p></p><p>B</p>")).toBe("A\n\nB");
  });

  it("strips script/style tags entirely, not just their outer tags", () => {
    expect(htmlToPlainText("<p>Safe</p><script>window.__pwned = true;</script>")).toBe("Safe");
    expect(htmlToPlainText("<style>.x{color:red}</style><p>Visible</p>")).toBe("Visible");
  });

  it("returns an empty string for empty input", () => {
    expect(htmlToPlainText("")).toBe("");
  });
});
