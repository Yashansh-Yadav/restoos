import type { DietType } from "@restoos/shared";
import { cn } from "@/lib/utils";

// FSSAI diet symbol (DESIGN.md §2): square outline with a filled circle (veg) or triangle
// (non-veg); egg uses the warning colour. Always labelled for screen readers.

const LABEL: Record<DietType, string> = { VEG: "Veg", NON_VEG: "Non-veg", EGG: "Egg" };
const COLOR: Record<DietType, string> = {
  VEG: "text-veg",
  NON_VEG: "text-non-veg",
  EGG: "text-warning",
};

export const dietLabel = (d: DietType) => LABEL[d];

export function DietMarker({
  diet,
  className,
  decorative = false,
  label,
}: {
  diet: DietType;
  className?: string;
  /** True when the diet is already written next to it (avoids reading it twice). */
  decorative?: boolean;
  /** Translated label (customer screens); defaults to the English one. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-4 shrink-0", COLOR[diet], className)}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label ?? LABEL[diet] })}
    >
      <rect
        x="1"
        y="1"
        width="14"
        height="14"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {diet === "NON_VEG" ? (
        <path d="M8 4.2 L11.8 11.2 H4.2 Z" fill="currentColor" />
      ) : (
        <circle cx="8" cy="8" r="3.6" fill="currentColor" />
      )}
    </svg>
  );
}
