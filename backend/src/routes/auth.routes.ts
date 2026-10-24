import { Router } from 'express';
import type { Request } from 'express';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '../config/session.js';
import { createCsrfProtection, createLogoutCsrfProtection, getOrCreateCsrfToken } from '../middleware/csrf.js';
import { createLoginRateLimiter } from '../middleware/loginRateLimit.js';
import { createSignupRateLimiter } from '../middleware/rateLimit.js';
import type { UserRepository } from '../repositories/user.repository.js';
import {
  DuplicateAccountError,
  InvalidCredentialsError,
  LoginValidationError,
  SignupValidationError,
  login,
  signup,
} from '../services/auth.service.js';

export function createAuthRouter(
  users: UserRepository,
  allowedOrigins: string[],
) {
  const router = Router();
  const requireCsrf = createCsrfProtection(allowedOrigins);
  const rateLimitLogin = createLoginRateLimiter();
  const rateLimitLoginByIp = createLoginRateLimiter({ keyByIp: true, maxAttempts: 30 });
  const rateLimitSignup = createSignupRateLimiter();
  router.get('/csrf', (request, response) => {
    request.session.csrfToken ??= getOrCreateCsrfToken();
    response.status(200).json({ status: 'ok', csrfToken: request.session.csrfToken });
  });

  router.post('/signup', requireCsrf, rateLimitSignup, async (request, response, next) => {
    try {
      const user = await signup(request.body, users);
      response.status(201).json({ status: 'ok', user });
    } catch (error) {
      if (error instanceof SignupValidationError) {
        response.status(400).json({
          status: 'error',
          message: error.message,
          fields: error.fields,
        });
        return;
      }
      if (error instanceof DuplicateAccountError) {
        response.status(409).json({
          status: 'error',
          message: error.message,
          field: error.field,
        });
        return;
      }
      next(error);
    }
  });

  router.post('/login', requireCsrf, rateLimitLogin, rateLimitLoginByIp, async (request, response, next) => {
    try {
      const user = await login(request.body, users);
      await regenerateSession(request);
      request.session.userId = user.id;
      request.session.csrfToken = getOrCreateCsrfToken();
      await saveSession(request);
      response.status(200).json({
        status: 'ok',
        user,
        csrfToken: request.session.csrfToken,
      });
    } catch (error) {
      if (error instanceof LoginValidationError) {
        response.status(400).json({ status: 'error', message: error.message });
        return;
      }
      if (error instanceof InvalidCredentialsError) {
        response.status(401).json({ status: 'error', message: error.message });
        return;
      }
      next(error);
    }
  });

  router.get('/me', async (request, response, next) => {
    if (!request.session.userId) {
      response.status(401).json({ status: 'error', message: 'Authentication required' });
      return;
    }

    try {
      const user = await users.findById(request.session.userId);
      if (!user) {
        await destroySession(request);
        response.status(401).json({ status: 'error', message: 'Authentication required' });
        return;
      }
      response.status(200).json({ status: 'ok', user });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', createLogoutCsrfProtection(allowedOrigins), async (request, response, next) => {
    try {
      await destroySession(request);
      response.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: SESSION_COOKIE_OPTIONS.httpOnly,
        secure: SESSION_COOKIE_OPTIONS.secure,
        sameSite: SESSION_COOKIE_OPTIONS.sameSite,
        path: SESSION_COOKIE_OPTIONS.path,
      });
      response.status(200).json({ status: 'ok', message: 'Logged out' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function regenerateSession(request: Request) {
  return new Promise<void>((resolve, reject) => {
    request.session.regenerate((error) => error ? reject(error) : resolve());
  });
}

function saveSession(request: Request) {
  return new Promise<void>((resolve, reject) => {
    request.session.save((error) => error ? reject(error) : resolve());
  });
}

function destroySession(request: Request) {
  return new Promise<void>((resolve, reject) => {
    request.session.destroy((error) => error ? reject(error) : resolve());
  });
}
