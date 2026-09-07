/**
 * In-memory sliding window rate limiter.
 * Protects expensive AI generation and sensitive API endpoints against abuse and DoS.
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodically clean up expired entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Checks whether a request under the given identifier exceeds the allowed limit.
 *
 * @param identifier Unique key (e.g. userId, IP address, or combined action key)
 * @param maxRequests Maximum requests allowed within windowMs
 * @param windowMs Time window in milliseconds (default: 60,000ms = 1 minute)
 * @returns { success: boolean, remaining: number, reset: number }
 */
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000
): { success: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const existing = rateLimitStore.get(identifier);

  if (!existing || now > existing.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: maxRequests - 1,
      reset: Math.ceil((now + windowMs) / 1000),
    };
  }

  if (existing.count >= maxRequests) {
    return {
      success: false,
      remaining: 0,
      reset: Math.ceil(existing.resetTime / 1000),
    };
  }

  existing.count++;
  return {
    success: true,
    remaining: maxRequests - existing.count,
    reset: Math.ceil(existing.resetTime / 1000),
  };
}
