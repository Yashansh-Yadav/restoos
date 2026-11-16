import * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui Textarea, matched to Input (DESIGN.md §5 Forms): 8px radius, 1px input border,
// 2px ink border + ring on focus, 16px text, danger border when invalid.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full min-w-0 rounded-sm border border-input bg-background px-3 py-3 text-base text-foreground transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-muted-foreground motion-reduce:transition-none",
        "focus-visible:border-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-2 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
