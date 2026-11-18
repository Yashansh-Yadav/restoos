import { pino } from "pino";
import { loadApiEnvOrExit } from "./env";
import { loggerOptions } from "./lib/logger";
import { initErrorReporting } from "./lib/observability";

// BullMQ worker entry point (plan §3). Runs from the same codebase as the API so it can
// scale separately. Queues and processors arrive with M7-T7 (WhatsApp) and M8-T4 (bell escalation).
// Jobs publish real-time events with createWorkerEventBus(redis) from ./socket/emitter (M4-T2):
// same publishEvent() and routing as the API, delivered through the Socket.io Redis adapter.
const env = loadApiEnvOrExit();
await initErrorReporting(env);
const log = pino({ ...loggerOptions(env), base: { service: "worker", env: env.NODE_ENV } });
log.info("no queues registered yet — nothing to do");
