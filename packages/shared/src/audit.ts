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
  // Table operations (M5-T7): guests moved, tables merged
  "table.transfer",
  "table.merge",
  // Orders (M5-T5): an item taken off a table after it was sent
  "order.voidItem",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
