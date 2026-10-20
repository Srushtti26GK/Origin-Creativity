import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createCsrfProtection } from '../middleware/csrf.js';
import type { ProfileUpdates, UserRepository } from '../repositories/user.repository.js';
import type { FollowRepository } from '../repositories/follow.repository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

export function createUsersRouter(
  users: UserRepository,
  allowedOrigins: string[],
  follows?: FollowRepository,
) {
  const router = Router();
  const requireCsrf = createCsrfProtection(allowedOrigins);

  if (follows) {
    router.get('/:username/follow-status', async (request, response, next) => {
      const username = normalizeUsername(request.params.username);
      if (!username) {
        response.status(400).json({ status: 'error', message: 'Invalid username' });
        return;
      }
      try {
        const stats = await follows.getStats(username, request.session.userId ?? null);
        if (!stats) {
          response.status(404).json({ status: 'error', message: 'User not found' });
          return;
        }
        response.status(200).json({ status: 'ok', ...stats });
      } catch (error) {
        next(error);
      }
    });

    for (const direction of ['followers', 'following'] as const) {
      router.get(`/:username/${direction}`, async (request, response, next) => {
        const username = normalizeUsername(request.params.username);
        const pagination = parsePagination(request.query.page, request.query.limit);
        if (!username) {
          response.status(400).json({ status: 'error', message: 'Invalid username' });
          return;
        }
        if (!pagination) {
          response.status(400).json({
            status: 'error',
            message: `page must be a positive integer and limit must be between 1 and ${MAX_PAGE_SIZE}.`,
          });
          return;
        }
        try {
          const result = direction === 'followers'
            ? await follows.listFollowers(username, pagination.pageSize, (pagination.page - 1) * pagination.pageSize)
            : await follows.listFollowing(username, pagination.pageSize, (pagination.page - 1) * pagination.pageSize);
          if (!result) {
            response.status(404).json({ status: 'error', message: 'User not found' });
            return;
          }
          response.status(200).json({
            status: 'ok',
            users: result.users,
            pagination: {
              page: pagination.page,
              pageSize: pagination.pageSize,
              total: result.total,
              totalPages: Math.ceil(result.total / pagination.pageSize),
            },
          });
        } catch (error) {
          next(error);
        }
      });
    }

    router.post('/:username/follow', requireAuthenticated, requireCsrf, async (request, response, next) => {
      const username = normalizeUsername(request.params.username);
      if (!username) {
        response.status(400).json({ status: 'error', message: 'Invalid username' });
        return;
      }
      try {
        const result = await follows.change(request.session.userId!, username, true);
        if (result === 'not_found') {
          response.status(404).json({ status: 'error', message: 'User not found' });
          return;
        }
        if (result === 'self') {
          response.status(400).json({ status: 'error', message: 'You cannot follow yourself' });
          return;
        }
        const stats = await follows.getStats(username, request.session.userId!);
        response.status(200).json({ status: 'ok', isFollowing: true, ...stats });
      } catch (error) {
        next(error);
      }
    });

    router.delete('/:username/follow', requireAuthenticated, requireCsrf, async (request, response, next) => {
      const username = normalizeUsername(request.params.username);
      if (!username) {
        response.status(400).json({ status: 'error', message: 'Invalid username' });
        return;
      }
      try {
        const result = await follows.change(request.session.userId!, username, false);
        if (result === 'not_found') {
          response.status(404).json({ status: 'error', message: 'User not found' });
          return;
        }
        if (result === 'self') {
          response.status(400).json({ status: 'error', message: 'You cannot unfollow yourself' });
          return;
        }
        const stats = await follows.getStats(username, request.session.userId!);
        response.status(200).json({ status: 'ok', isFollowing: false, ...stats });
      } catch (error) {
        next(error);
      }
    });
  }

  router.get('/:username/posts', async (request, response, next) => {
    const username = normalizeUsername(request.params.username);
    const pagination = parsePagination(request.query.page, request.query.limit);
    if (!username) {
      response.status(400).json({ status: 'error', message: 'Invalid username' });
      return;
    }
    if (!pagination) {
      response.status(400).json({
        status: 'error',
        message: `page must be a positive integer and limit must be between 1 and ${MAX_PAGE_SIZE}.`,
      });
      return;
    }

    try {
      const profile = await users.findPublicProfile(username);
      if (!profile) {
        response.status(404).json({ status: 'error', message: 'User not found' });
        return;
      }
      const total = await users.countPublicPosts(username);
      const posts = await users.listPublicPosts(
        username,
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      );
      response.status(200).json({
        status: 'ok',
        posts,
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          totalPages: Math.ceil(total / pagination.pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:username', async (request, response, next) => {
    const username = normalizeUsername(request.params.username);
    if (!username) {
      response.status(400).json({ status: 'error', message: 'Invalid username' });
      return;
    }

    try {
      const profile = await users.findPublicProfile(username);
      if (!profile) {
        response.status(404).json({ status: 'error', message: 'User not found' });
        return;
      }
      response.status(200).json({ status: 'ok', user: profile });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/me', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const updates = validateProfileUpdates(request.body);
    if (!updates) {
      response.status(400).json({
        status: 'error',
        message: 'Provide valid displayName, bio, and/or avatarUrl fields only.',
      });
      return;
    }

    try {
      const user = await users.updateProfile(request.session.userId!, updates);
      if (!user) {
        response.status(404).json({ status: 'error', message: 'User not found' });
        return;
      }
      response.status(200).json({ status: 'ok', user });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

const requireAuthenticated: RequestHandler = (request, response, next) => {
  if (!request.session.userId) {
    response.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }
  next();
};

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,30}$/.test(username) ? username : null;
}

function parsePagination(pageValue: unknown, limitValue: unknown) {
  const page = parsePositiveInteger(pageValue, DEFAULT_PAGE);
  const pageSize = parsePositiveInteger(limitValue, DEFAULT_PAGE_SIZE);
  if (
    page === null
    || pageSize === null
    || pageSize > MAX_PAGE_SIZE
    || !Number.isSafeInteger((page - 1) * pageSize)
  ) return null;
  return { page, pageSize };
}

function parsePositiveInteger(value: unknown, defaultValue: number): number | null {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validateProfileUpdates(body: unknown): ProfileUpdates | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const values = body as Record<string, unknown>;
  const allowedFields = new Set(['displayName', 'bio', 'avatarUrl']);
  const keys = Object.keys(values);
  if (keys.length === 0 || keys.some((key) => !allowedFields.has(key))) return null;

  const updates: ProfileUpdates = {};
  if ('displayName' in values) {
    if (typeof values.displayName !== 'string') return null;
    const displayName = values.displayName.trim();
    if (displayName.length < 1 || displayName.length > 80) return null;
    updates.displayName = displayName;
  }
  if ('bio' in values) {
    if (values.bio !== null && typeof values.bio !== 'string') return null;
    if (typeof values.bio === 'string' && values.bio.length > 500) return null;
    updates.bio = typeof values.bio === 'string' ? values.bio.trim() || null : null;
  }
  if ('avatarUrl' in values) {
    if (values.avatarUrl !== null && typeof values.avatarUrl !== 'string') return null;
    const avatarUrl = typeof values.avatarUrl === 'string' ? values.avatarUrl.trim() : '';
    if (avatarUrl.length > 2048) return null;
    if (avatarUrl) {
      try {
        const parsed = new URL(avatarUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        updates.avatarUrl = parsed.toString();
      } catch {
        return null;
      }
    } else {
      updates.avatarUrl = null;
    }
  }
  return updates;
}
