// Audit log actions (CLAUDE.md rule 7, M1-T7). A closed list so call sites can't drift; add new
// actions here as features land (void, discount over cap, bill cancel, merge/transfer, plan
// override, impersonation — M5 onwards).

export const AUDIT_ACTIONS = [
  // Shifts
  "shift.start",
  "shift.end",
  "shift.autoClosed",
  // Staff + devices (security-relevant)
  "staff.pinLocked",
  "staff.pinReset",
  "staff.deactivated",
  "staff.reactivated",
  "staff.roleChanged",
  "device.paired",
  "device.unpaired",
  // Settings
  "outlet.settingsChanged",
  // Floor (M3-T2): old printed QR card stops working
  "table.rotateQr",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
