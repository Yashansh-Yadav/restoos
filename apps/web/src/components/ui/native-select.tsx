import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

// Native <select> styled like Input (DESIGN.md §5 Forms). Native beats a custom listbox here:
// the phone's own picker, type-to-jump on desktop, and free accessibility. Explicit background and
// text colours (also on <option>) so Windows dark mode doesn't render a white popup.
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "h-12 w-full min-w-0 cursor-pointer appearance-none rounded-sm border border-input bg-background pr-10 pl-3 text-base text-foreground transition-[border-color,box-shadow] duration-150 outline-none motion-reduce:transition-none",
          "focus-visible:border-2 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "aria-invalid:border-2 aria-invalid:border-destructive",
          "[&>option]:bg-background [&>option]:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

export { NativeSelect };
