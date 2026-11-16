import { randomUUID } from "node:crypto";
import {
  LogController,
  type FastifyServerOptions,
  type RawRequestDefaultExpression,
} from "fastify";
import type { ApiEnv } from "../env";

// Structured logging (M0-T6): pino via Fastify. Every request log line carries `requestId`;
// secrets and personal data are redacted before anything is written (CLAUDE.md rule 9, DPDP).

export const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = ["pin", "otp", "password", "token", "secret", "pinHash", "tokenHash"];

/**
 * Paths pino replaces with [REDACTED] in every log line. Note pino's `*.key` only matches one
 * level down, so each sensitive key is listed at the top level, one level and two levels deep.
 */
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-device-secret"]',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS.flatMap((k) => [k, `*.${k}`, `*.*.${k}`]),
];

type LoggerEnv = Pick<ApiEnv, "LOG_LEVEL" | "NODE_ENV">;

/** pino options for apps/api — shared by server.ts, worker.ts and tests. */
export function loggerOptions(env: LoggerEnv) {
  return {
    level: env.LOG_LEVEL,
    base: { service: "api", env: env.NODE_ENV },
    redact: { paths: REDACT_PATHS, censor: REDACTED },
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  };
}

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,128}$/;
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Reuses a well-formed incoming `x-request-id` (set by Caddy / a load balancer) so one id follows
 * the request across services; otherwise generates a UUID. Malformed ids are never trusted.
 */
export function genReqId(req: RawRequestDefaultExpression): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value && REQUEST_ID_RE.test(value) ? value : randomUUID();
}

/** Fastify options that put the request id (as `requestId`) on every log line. */
export function requestIdOptions() {
  return {
    genReqId,
    logController: new LogController({ requestIdLogLabel: "requestId" }),
    requestIdHeader: false,
  } satisfies Partial<FastifyServerOptions>;
}
