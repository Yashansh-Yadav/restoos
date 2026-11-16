import { loadApiEnvOrExit } from "./env";

// Fail fast (M0-T3): validate the environment BEFORE loading anything heavy. ES module imports
// all run before any code, so Better Auth, Prisma, ioredis etc. live in main.ts and are loaded
// only once the config is known to be valid.
const env = loadApiEnvOrExit();
const { start } = await import("./main");
await start(env);
