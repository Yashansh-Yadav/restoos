import { buildApp } from "./app";

// Env validation with zod arrives in M0-T3; until then HOST/PORT have defaults.
const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 4000);
const isProd = process.env.NODE_ENV === "production";

const app = await buildApp({
  logger: isProd ? true : { transport: { target: "pino-pretty", options: { colorize: true } } },
});

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host, port });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
