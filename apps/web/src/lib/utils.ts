import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom spacing tokens from packages/config/tailwind/theme.css,
// so `h-12` and `h-touch-hero` are treated as conflicting heights.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["touch", "touch-staff", "touch-hero"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
