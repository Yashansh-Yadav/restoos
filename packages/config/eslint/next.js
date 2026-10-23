// Flat config for apps/web: Next.js core-web-vitals + strict TypeScript rules.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import { ignores, strictTsRules } from "./base.js";

/** @param {string} tsconfigRootDir */
export function next(tsconfigRootDir) {
  return [
    ignores,
    { ignores: ["next-env.d.ts"] },
    ...nextVitals,
    ...nextTs,
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: { parserOptions: { projectService: true, tsconfigRootDir } },
      rules: {
        ...strictTsRules.rules,
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-misused-promises": "error",
      },
    },
    { files: ["**/*.{js,mjs,cjs}"], ...tseslint.configs.disableTypeChecked },
  ];
}
