import type { StaffRole } from "@restoos/shared";

// Socket.io room names (plan §8). One helper so the handshake (M4-T1) and event routing (M4-T2)
// can't disagree on a name.
export const rooms = {
  staff: (outletId: string) => `outlet:${outletId}:staff`,
  role: (outletId: string, role: StaffRole) => `outlet:${outletId}:role:${role}`,
  employee: (outletId: string, employeeId: string) => `outlet:${outletId}:employee:${employeeId}`,
  kitchen: (outletId: string) => `outlet:${outletId}:kitchen`,
  owner: (outletId: string) => `outlet:${outletId}:owner`,
  table: (qrToken: string) => `table:${qrToken}`,
};
