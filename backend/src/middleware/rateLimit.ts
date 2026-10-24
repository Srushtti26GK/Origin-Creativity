import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

interface FixedWindowOptions {
  windowMs: number;
  maxRequests: number;
  maxEntries?: number;
  key: (request: Request) => string;
  message: string;
  now?: () => number;
}

export function createFixedWindowRateLimiter(options: FixedWindowOptions): RequestHandler {
  const maxEntries = options.maxEntries ?? 10_000;
  const now = options.now ?? Date.now;
  const requests = new Map<string, { startedAt: number; count: number }>();

  return (request, response, next) => {
    const key = createHash('sha256').update(options.key(request)).digest('hex');
    const currentTime = now();
    let current = requests.get(key);
    if (current && currentTime - current.startedAt >= options.windowMs) {
      requests.delete(key);
      current = undefined;
    }

    if (!current && requests.size >= maxEntries) {
      for (const [entryKey, entry] of requests) {
        if (currentTime - entry.startedAt >= options.windowMs) requests.delete(entryKey);
      }
      if (requests.size >= maxEntries) {
        response.setHeader('Retry-After', String(Math.ceil(options.windowMs / 1000)));
        response.status(429).json({ status: 'error', message: options.message });
        return;
      }
    }

    if (current && current.count >= options.maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((current.startedAt + options.windowMs - currentTime) / 1000),
      );
      response.setHeader('Retry-After', String(retryAfterSeconds));
      response.status(429).json({ status: 'error', message: options.message });
      return;
    }

    if (current) current.count += 1;
    else requests.set(key, { startedAt: currentTime, count: 1 });
    next();
  };
}

export function createSignupRateLimiter(): RequestHandler {
  return createFixedWindowRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 10,
    key: (request) => request.ip ?? 'unknown',
    message: 'Too many signup attempts. Try again later.',
  });
}

export function createUploadRateLimiter(): RequestHandler {
  return createFixedWindowRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 20,
    key: (request) => request.session.userId ?? 'unauthenticated',
    message: 'Too many image uploads. Try again later.',
  });
}
