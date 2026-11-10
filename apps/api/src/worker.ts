import { loadApiEnvOrExit } from "./env";

// BullMQ worker entry point (plan §3). Runs from the same codebase as the API so it can
// scale separately. Queues and processors arrive with M7-T7 (WhatsApp) and M8-T4 (bell escalation).
loadApiEnvOrExit();
console.log("[worker] no queues registered yet — nothing to do");
