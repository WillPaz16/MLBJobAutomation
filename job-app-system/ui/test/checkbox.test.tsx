import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Checkbox } from "../src/components/ui/checkbox";

// v10 accessibility pass: the indeterminate ("some selected") state used to render the exact
// same checkmark icon as the checked ("all selected") state, making Discovery's bulk-select bar
// visually ambiguous. The fix is centralized in ui/src/components/ui/checkbox.tsx, which now
// branches on the `indeterminate` prop to swap in a minus icon.
describe("Checkbox indeterminate rendering", () => {
  it("renders a distinct minus-icon indicator when indeterminate, not the checkmark", () => {
    const { container } = render(<Checkbox indeterminate checked={false} />);
    expect(container.querySelector('[data-slot="checkbox-indeterminate-icon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="checkbox-check-icon"]')).not.toBeInTheDocument();
  });

  it("renders the checkmark icon, not the minus icon, when fully checked", () => {
    const { container } = render(<Checkbox checked indeterminate={false} />);
    expect(container.querySelector('[data-slot="checkbox-check-icon"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="checkbox-indeterminate-icon"]')).not.toBeInTheDocument();
  });
});
