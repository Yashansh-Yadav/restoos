// Menu constants (M2-T1). Money is integer paise; rates are basis points (CLAUDE.md rule 1).

/**
 * GST rates an item may carry, in basis points: 0, 5, 18, 40 % — the slabs in force since the
 * Sept 2025 rationalisation (12 % and 28 % were folded in). Restaurant food is usually 5 %.
 * One place to change if a CA confirms otherwise (plan §18).
 */
export const GST_RATES_BPS = [0, 500, 1800, 4000] as const;
export type GstRateBps = (typeof GST_RATES_BPS)[number];
export const DEFAULT_GST_RATE_BPS: GstRateBps = 500;

/** SAC for restaurant services; printed on bills when an item has no HSN of its own. */
export const DEFAULT_HSN_SAC = "996331";

export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MENU_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Stored images fit inside this square (WebP). */
export const MENU_IMAGE_MAX_PX = 800;

export const MAX_VARIANTS = 10;
export const MAX_ADDONS_PER_GROUP = 30;
