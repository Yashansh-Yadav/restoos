import { base } from "@restoos/config/eslint/base";

export default [{ ignores: ["src/generated/**"] }, ...base(import.meta.dirname)];
