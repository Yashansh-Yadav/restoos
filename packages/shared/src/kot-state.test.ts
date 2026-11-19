import { describe, expect, it } from "vitest";
import { isKotStep, kotStage } from "./kot-state";

describe("kitchen ticket stages (M5-T3)", () => {
  it("derives the stage from the active items", () => {
    expect(kotStage(["SENT", "SENT"])).toBe("NEW");
    expect(kotStage(["SENT", "PREPARING"])).toBe("PREPARING");
    expect(kotStage(["READY", "PREPARING"])).toBe("PREPARING");
    expect(kotStage(["READY", "SENT"])).toBe("PREPARING");
    expect(kotStage(["READY", "READY"])).toBe("READY");
  });

  it("ignores voided and served items; nothing left → off the board", () => {
    expect(kotStage(["SENT", "VOIDED"])).toBe("NEW");
    expect(kotStage(["READY", "SERVED"])).toBe("READY");
    expect(kotStage(["SERVED", "VOIDED"])).toBeNull();
    expect(kotStage([])).toBeNull();
  });

  it("allows one step forward or back only", () => {
    expect(isKotStep("NEW", "PREPARING")).toBe(true);
    expect(isKotStep("PREPARING", "READY")).toBe(true);
    expect(isKotStep("READY", "PREPARING")).toBe(true);
    expect(isKotStep("PREPARING", "NEW")).toBe(true);
    expect(isKotStep("NEW", "READY")).toBe(false);
    expect(isKotStep("READY", "NEW")).toBe(false);
    expect(isKotStep("NEW", "NEW")).toBe(false);
  });
});
