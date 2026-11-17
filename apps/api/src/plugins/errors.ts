import type { FastifyError, FastifyInstance, FastifyRequest } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";
import type { ApiErrorBody } from "@restoos/shared";
import { AppError } from "../lib/errors";

function body(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** Called for unexpected (5xx) errors only — wired to Sentry by server.ts. */
export type ServerErrorHook = (err: unknown, req: FastifyRequest) => void;

/**
 * One error shape for every response: `{ error: { code, message, details? } }`.
 * Registered on the root instance (not encapsulated) so it applies to all routes.
 * 4xx are expected client errors (logged at info by Fastify); 5xx are logged as errors and
 * reported via `onServerError`. The client never sees internal details, only the request id.
 */
export function registerErrorHandling(
  app: FastifyInstance,
  { onServerError }: { onServerError?: ServerErrorHook } = {},
): void {
  const serverError = (err: unknown, req: FastifyRequest, msg: string) => {
    req.log.error({ err }, msg);
    onServerError?.(err, req);
    return body("INTERNAL_ERROR", "Internal server error");
  };

  app.setNotFoundHandler((req, reply) => {
    void reply.code(404).send(body("NOT_FOUND", `Route ${req.method} ${req.url} not found`));
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply
        .code(400)
        .send(body("VALIDATION_ERROR", "Request validation failed", err.validation));
    }

    if (isResponseSerializationError(err)) {
      return reply.code(500).send(serverError(err, req, "response did not match its schema"));
    }

    const status = err.statusCode ?? 500;
    if (status >= 500) {
      return reply.code(500).send(serverError(err, req, "unhandled error"));
    }

    const details = err instanceof AppError ? err.details : undefined;
    return reply.code(status).send(body(err.code || "BAD_REQUEST", err.message, details));
  });
}
