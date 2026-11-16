import { Redis } from "ioredis";

// Shared Redis client (plan §2): Better Auth rate limits, OTP throttles; later BullMQ, caches.
export function createRedis(url: string): Redis {
  return new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    // Fail fast on a dead Redis instead of queueing commands forever.
    enableOfflineQueue: true,
  });
}

export type { Redis };
