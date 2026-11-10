import type { z } from "zod";

// Pure env validation (safe to import from browser bundles). The Node-only .env loader lives in
// ./env-node.ts (`@restoos/shared/env/node`).

/** Thrown when environment variables are missing or invalid. The message lists every problem. */
export class EnvError extends Error {
  constructor(
    readonly appName: string,
    readonly problems: readonly string[],
  ) {
    super(
      `✖ Invalid environment for ${appName}:\n` +
        problems.map((p) => `  • ${p}`).join("\n") +
        "\n  Set them in the shell or in the repo-root .env (see .env.example).",
    );
    this.name = "EnvError";
  }
}

type EnvSource = Record<string, string | undefined>;

/**
 * Validates environment variables against a zod schema and returns the typed result.
 * Empty strings count as unset (so `KEY=` lines in .env behave like missing keys).
 * Error messages name the variable and the rule, never the value (they may be secrets).
 */
export function parseEnv<S extends z.ZodType>(
  appName: string,
  schema: S,
  source: EnvSource = process.env,
): z.infer<S> {
  const cleaned: EnvSource = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== "") cleaned[key] = value;
  }

  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    const missing = issue.code === "invalid_type" && cleaned[key] === undefined;
    return `${key}: ${missing ? "required" : issue.message}`;
  });
  throw new EnvError(appName, problems);
}
