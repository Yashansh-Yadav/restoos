import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../lib/auth";

// Mounts Better Auth at /api/auth/* (M1-T1) by bridging Fastify ↔ Fetch Request/Response.

export function registerAuthHandler(app: FastifyInstance, auth: Auth, appUrl: string): void {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      // Build the URL on the public origin (requests arrive via the same-origin /api proxy).
      const url = new URL(request.url, appUrl);
      const hasBody =
        request.body !== undefined && request.body !== null && request.method !== "GET";
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        }),
      );

      void reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") void reply.header(key, value);
      });
      // Keep every cookie (session + state cookies are separate Set-Cookie headers).
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) void reply.header("set-cookie", cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });
}

export type OwnerSession = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

/** Returns the signed-in owner's session, or replies 401 and returns null. */
export async function requireOwnerSession(
  auth: Auth,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<OwnerSession | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    await reply
      .code(401)
      .send({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue" } });
    return null;
  }
  return session;
}
