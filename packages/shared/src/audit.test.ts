import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "./audit";

describe("AUDIT_ACTIONS", () => {
  it("is a closed list of unique `area.verb` names", () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const a of AUDIT_ACTIONS) expect(a).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
  });
});
