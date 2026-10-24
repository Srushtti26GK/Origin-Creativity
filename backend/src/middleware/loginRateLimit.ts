import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';

interface LoginAttemptWindow {
  startedAt: number;
  failedAttempts: number;
  inFlight: number;
}

interface LoginRateLimitOptions {
  windowMs?: number;
  maxAttempts?: number;
  maxEntries?: number;
  keyByIp?: boolean;
  now?: () => number;
}

export function createLoginRateLimiter(
  options: LoginRateLimitOptions = {},
): RequestHandler {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  const maxEntries = options.maxEntries ?? 10_000;
  const keyByIp = options.keyByIp ?? false;
  const now = options.now ?? Date.now;
  const attempts = new Map<string, LoginAttemptWindow>();

  return (request, response, next) => {
    const ip = request.ip ?? 'unknown';
    const identifier = typeof request.body?.identifier === 'string'
      ? request.body.identifier.trim().toLowerCase()
      : '';
    const key = createHash('sha256')
      .update(keyByIp ? ip : `${ip}\0${identifier}`)
      .digest('hex');
    const currentTime = now();

    let current = attempts.get(key);
    if (current && currentTime - current.startedAt >= windowMs) {
      if (current.inFlight === 0) {
        attempts.delete(key);
        current = undefined;
      } else {
        current.startedAt = currentTime;
        current.failedAttempts = 0;
      }
    }

    if (current && current.failedAttempts + current.inFlight >= maxAttempts) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.startedAt + windowMs - currentTime) / 1000),
      );
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(429).json({
        status: 'error',
        message: 'Too many login attempts. Try again later.',
      });
      return;
    }

    if (!current) {
      if (attempts.size >= maxEntries) {
        const evictableKey = [...attempts].find(([, entry]) => entry.inFlight === 0)?.[0];
        if (evictableKey) attempts.delete(evictableKey);
        else {
          response.status(429).json({
            status: 'error',
            message: 'Too many login attempts. Try again later.',
          });
          return;
        }
      }
      current = { startedAt: currentTime, failedAttempts: 0, inFlight: 0 };
      attempts.set(key, current);
    }

    current.inFlight += 1;
    response.once('finish', () => {
      current!.inFlight -= 1;
      if (response.statusCode === 401) {
        current!.failedAttempts += 1;
      } else if (response.statusCode === 200) {
        current!.failedAttempts = 0;
      }
      if (current!.inFlight === 0 && current!.failedAttempts === 0) {
        attempts.delete(key);
      }
    });

    next();
  };
}
