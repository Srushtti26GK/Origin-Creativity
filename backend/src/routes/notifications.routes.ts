import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createCsrfProtection } from '../middleware/csrf.js';
import type { NotificationRepository } from '../repositories/notification.repository.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createNotificationsRouter(
  notifications: NotificationRepository,
  allowedOrigins: string[],
) {
  const router = Router();
  const requireCsrf = createCsrfProtection(allowedOrigins);

  router.get('/', requireAuthenticated, async (request, response, next) => {
    const page = parsePositiveInteger(request.query.page, 1);
    const pageSize = parsePositiveInteger(request.query.limit, DEFAULT_PAGE_SIZE);
    if (page === null || pageSize === null || pageSize > MAX_PAGE_SIZE
      || !Number.isSafeInteger((page - 1) * pageSize)) {
      response.status(400).json({ status: 'error', message: 'Invalid notification pagination.' });
      return;
    }
    try {
      const result = await notifications.list(
        request.session.userId!,
        pageSize,
        (page - 1) * pageSize,
      );
      response.status(200).json({
        status: 'ok',
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages: Math.ceil(result.total / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/read-all', requireAuthenticated, requireCsrf, async (request, response, next) => {
    try {
      const updatedCount = await notifications.markAllRead(request.session.userId!);
      response.status(200).json({ status: 'ok', updatedCount, unreadCount: 0 });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:notificationId/read', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const notificationId = request.params.notificationId;
    if (typeof notificationId !== 'string' || !UUID_PATTERN.test(notificationId)) {
      response.status(400).json({ status: 'error', message: 'Invalid notification ID.' });
      return;
    }
    try {
      const updated = await notifications.markRead(notificationId, request.session.userId!);
      if (!updated) {
        response.status(404).json({ status: 'error', message: 'Notification not found.' });
        return;
      }
      response.status(200).json({ status: 'ok' });
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

function parsePositiveInteger(value: unknown, defaultValue: number): number | null {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
