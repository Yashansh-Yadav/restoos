// Demo tenant for local development (plan §6.2). PINs are fixed so the seed can print them on every
// run; they are stored only as argon2 hashes. Never seed this data into staging or production.

export const DEMO_ORG = {
  name: "Saffron Table",
  legalName: "Saffron Table Hospitality Pvt Ltd",
  gstin: "27AABCS1234F1Z5", // placeholder format, not a real registration
} as const;

export const DEMO_OUTLET = {
  code: "A1",
  name: "Saffron Table — Bandra",
  address: "12 Hill Road, Bandra West, Mumbai 400050",
  stateCode: "27", // Maharashtra
  gstin: "27AABCS1234F1Z5",
  fssaiNumber: "11526999000123", // placeholder
  googleReviewUrl: "https://g.page/r/demo-review-link",
} as const;

export const DEMO_SECTIONS = [
  { name: "Main hall", sortOrder: 0, tables: 8 },
  { name: "Terrace", sortOrder: 1, tables: 4 },
] as const;

export type StaffRoleSeed = "MANAGER" | "CASHIER" | "BUTLER" | "KITCHEN";

export const DEMO_STAFF: readonly { name: string; role: StaffRoleSeed; pin: string }[] = [
  { name: "Meera", role: "MANAGER", pin: "1001" },
  { name: "Kabir", role: "CASHIER", pin: "2001" },
  { name: "Priya", role: "BUTLER", pin: "3001" },
  { name: "Arjun", role: "BUTLER", pin: "3002" },
  { name: "Rahul", role: "BUTLER", pin: "3003" },
  { name: "Imran", role: "KITCHEN", pin: "4001" },
];

export const DEMO_DEVICES = [
  { code: "D1", label: "Counter tablet", isStation: false },
  { code: "D2", label: "Kitchen tablet", isStation: true },
] as const;
