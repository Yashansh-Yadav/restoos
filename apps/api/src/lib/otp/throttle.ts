import type { Redis } from "ioredis";

// Per-phone OTP throttle on top of Better Auth's per-IP rate limit, so one number can't be
// bombarded with SMS (and your SMS bill) from many IPs.

export const OTP_COOLDOWN_SECONDS = 30;
export const OTP_MAX_PER_HOUR = 5;

export type ThrottleResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export async function checkOtpThrottle(redis: Redis, phoneNumber: string): Promise<ThrottleResult> {
  const cooldownKey = `otp:cooldown:${phoneNumber}`;
  const hourKey = `otp:hour:${phoneNumber}`;

  // SET NX EX: only one send per cooldown window, atomically.
  const firstInWindow = await redis.set(cooldownKey, "1", "EX", OTP_COOLDOWN_SECONDS, "NX");
  if (firstInWindow !== "OK") {
    const ttl = await redis.ttl(cooldownKey);
    return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
  }

  const sentThisHour = await redis.incr(hourKey);
  if (sentThisHour === 1) await redis.expire(hourKey, 3_600);
  if (sentThisHour > OTP_MAX_PER_HOUR) {
    const ttl = await redis.ttl(hourKey);
    return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
  }
  return { allowed: true };
}
