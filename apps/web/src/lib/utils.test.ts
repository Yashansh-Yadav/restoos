import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("joins conditional classes", () => {
    expect(cn("a", false, "b", undefined)).toBe("a b");
  });

  it("lets later Tailwind classes win", () => {
    expect(cn("h-12 px-4", "h-touch-hero")).toBe("px-4 h-touch-hero");
  });
});
