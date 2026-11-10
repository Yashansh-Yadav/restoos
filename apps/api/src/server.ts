import { buildApp } from "./app";
import { loadApiEnvOrExit } from "./env";

// Fail fast: validate every env var before anything else starts (M0-T3).
const env = loadApiEnvOrExit();
const isProd = env.NODE_ENV === "production";

const app = await buildApp({
  logger: isProd
    ? { level: env.LOG_LEVEL }
    : { level: env.LOG_LEVEL, transport: { target: "pino-pretty", options: { colorize: true } } },
  docs: !isProd,
});

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
