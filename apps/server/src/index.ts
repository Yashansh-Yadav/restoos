import { createAppServer } from "./app";

// Env validation with zod arrives in M0-T3; until then PORT defaults to 4000.
const port = Number(process.env.PORT ?? 4000);
const server = createAppServer();

server.listen(port, () => {
  console.log(`[server] listening on http://localhost:${port}`);
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
