import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

// Base UI's CheckboxRoot tracks `indeterminate` as its own boolean state (separate from
// `checked` — see CheckboxRoot.d.ts's `indeterminate: boolean` on CheckboxRootState, and
// CheckboxRootDataAttributes' `data-indeterminate`), and CheckboxIndicator renders whenever
// EITHER `checked` or `indeterminate` is true. So the indicator's children must branch on
// `props.indeterminate` themselves — the primitive gives no built-in "indeterminate icon" swap,
// unlike some other checkbox libraries. Without this, "some selected" and "all selected" render
// the exact same checkmark (the v10 accessibility-pass bug this fixes).
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {props.indeterminate ? (
          <MinusIcon data-slot="checkbox-indeterminate-icon" />
        ) : (
          <CheckIcon data-slot="checkbox-check-icon" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
