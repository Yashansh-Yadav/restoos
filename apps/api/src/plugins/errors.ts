import type { FastifyError, FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";
import type { ApiErrorBody } from "@restoos/shared";

function body(code: string, message: string, details?: unknown): ApiErrorBody {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/**
 * One error shape for every response: `{ error: { code, message, details? } }`.
 * Registered on the root instance (not encapsulated) so it applies to all routes.
 */
export function registerErrorHandling(app: FastifyInstance): void {
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
      req.log.error({ err }, "response did not match its schema");
      return reply.code(500).send(body("INTERNAL_ERROR", "Internal server error"));
    }

    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, "unhandled error");
      return reply.code(500).send(body("INTERNAL_ERROR", "Internal server error"));
    }

    return reply.code(status).send(body(err.code || "BAD_REQUEST", err.message));
  });
}
