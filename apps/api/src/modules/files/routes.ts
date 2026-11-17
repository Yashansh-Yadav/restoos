import type { FastifyPluginAsync } from "fastify";
import type { FileStorage } from "../../lib/storage";

// GET /api/files/* — serves files from the local storage driver (dev/tests; production uses S3).
// Keys are random per upload, so files can be cached forever.

export const fileRoutes =
  (storage: FileStorage): FastifyPluginAsync =>
  async (app) => {
    app.get("/files/*", async (request, reply) => {
      const key = (request.params as { "*": string })["*"];
      const file = storage.read ? await storage.read(key) : null;
      if (!file) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "File not found" } });
      }
      return reply
        .header("content-type", file.contentType)
        .header("cache-control", "public, max-age=31536000, immutable")
        .header("x-content-type-options", "nosniff")
        .send(file.bytes);
    });
  };
