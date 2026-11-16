import { base } from "@restoos/config/eslint/base";
import { apiModuleImportRule } from "@restoos/config/eslint/restrictions";

export default [
  ...base(import.meta.dirname),
  // Rule 3: feature modules reach the database only through getTenantDb(ctx). Tests may arrange
  // fixtures with the raw client.
  {
    files: ["src/modules/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-restricted-imports": apiModuleImportRule },
  },
];
