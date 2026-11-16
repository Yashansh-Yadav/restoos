import * as React from "react";
import { cn } from "@/lib/utils";

// Label above the field, `caption` style from DESIGN.md (14px / 500, muted).
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("text-sm font-medium text-muted-foreground select-none", className)}
      {...props}
    />
  );
}

export { Label };
