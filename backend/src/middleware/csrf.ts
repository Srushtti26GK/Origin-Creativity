import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';

export function getOrCreateCsrfToken(): string {
  return randomBytes(32).toString('base64url');
}

export function createCsrfProtection(allowedOrigins: string[]): RequestHandler {
  return (request, response, next) => {
    const origin = request.get('origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      response.status(403).json({ status: 'error', message: 'Request origin is not allowed' });
      return;
    }

    const expected = request.session.csrfToken;
    const supplied = request.get('x-csrf-token');
    if (!expected || !supplied || !equalToken(expected, supplied)) {
      response.status(403).json({ status: 'error', message: 'Invalid CSRF token' });
      return;
    }

    next();
  };
}

export function createLogoutCsrfProtection(allowedOrigins: string[]): RequestHandler {
  const requireToken = createCsrfProtection(allowedOrigins);

  return (request, response, next) => {
    const origin = request.get('origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      response.status(403).json({ status: 'error', message: 'Request origin is not allowed' });
      return;
    }
    if (!request.session.userId && !request.session.csrfToken) {
      next();
      return;
    }
    requireToken(request, response, next);
  };
}

function equalToken(expected: string, supplied: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}
