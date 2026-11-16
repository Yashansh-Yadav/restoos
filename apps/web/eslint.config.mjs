import { next } from "@restoos/config/eslint/next";
import { webImportRule } from "@restoos/config/eslint/restrictions";

export default [
  ...next(import.meta.dirname),
  // Rule 2: the web app is frontend only — no database, Redis or auth adapters.
  { files: ["**/*.{ts,tsx,js,mjs}"], rules: { "no-restricted-imports": webImportRule } },
];
