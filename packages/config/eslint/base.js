// Shared flat config for every TypeScript workspace.
// CLAUDE.md: TypeScript strict, no `any`, no non-null assertions.
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export const ignores = {
  ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**", "**/.turbo/**"],
};

/** Rules shared by base and next configs (expects typescript-eslint to be registered). */
export const strictTsRules = {
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
};

/** @param {string} tsconfigRootDir */
export function base(tsconfigRootDir) {
  return tseslint.config(
    ignores,
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    strictTsRules,
    { files: ["**/*.{js,mjs,cjs}"], ...tseslint.configs.disableTypeChecked },
  );
}
