import { describe, expect, it } from "vitest";
import { assignTableSchema, copyPlan } from "./assignments";

describe("table assignment (M3-T3)", () => {
  it("copies last shift's tables that still exist and nobody else holds", () => {
    expect(copyPlan(["t1", "t2", "t3", "t1"], new Set(["t1", "t2"]), new Set(["t2"]))).toEqual([
      "t1",
    ]);
    expect(copyPlan([], new Set(["t1"]), new Set())).toEqual([]);
  });

  it("accepts null to unassign, rejects an empty id", () => {
    expect(assignTableSchema.parse({ employeeId: null })).toEqual({ employeeId: null });
    expect(assignTableSchema.safeParse({ employeeId: "" }).success).toBe(false);
  });
});
