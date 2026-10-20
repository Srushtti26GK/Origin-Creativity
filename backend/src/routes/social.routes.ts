import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createCsrfProtection } from '../middleware/csrf.js';
import type { SocialRepository } from '../repositories/social.repository.js';

const COMMENT_MAX_LENGTH = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSocialRouter(social: SocialRepository, allowedOrigins: string[]) {
  const router = Router();
  const requireCsrf = createCsrfProtection(allowedOrigins);

  router.post('/:postId/like', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = parseId(request.params.postId);
    if (!postId) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const result = await social.changeLike(postId, request.session.userId!, true);
      if (result === 'not_found') {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId!);
      response.status(200).json({ status: 'ok', ...stats.get(postId) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:postId/like', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = parseId(request.params.postId);
    if (!postId) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const result = await social.changeLike(postId, request.session.userId!, false);
      if (result === 'not_found') {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId!);
      response.status(200).json({ status: 'ok', ...stats.get(postId) });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:postId/comments', async (request, response, next) => {
    const postId = parseId(request.params.postId);
    if (!postId) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const result = await social.listComments(postId);
      if (!result) {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      response.status(200).json({
        status: 'ok',
        comments: result.comments,
        commentCount: result.total,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:postId/comments', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = parseId(request.params.postId);
    const text = validateComment(request.body);
    if (!postId || text === null) {
      response.status(400).json({ status: 'error', message: 'Comment must be between 1 and 300 characters.' });
      return;
    }
    try {
      const comment = await social.createComment(postId, request.session.userId!, text);
      if (!comment) {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId!);
      response.status(201).json({
        status: 'ok',
        comment,
        commentCount: stats.get(postId)?.commentsCount ?? 0,
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:postId/comments/:commentId', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = parseId(request.params.postId);
    const commentId = parseId(request.params.commentId);
    if (!postId || !commentId) {
      response.status(400).json({ status: 'error', message: 'Invalid post or comment ID' });
      return;
    }
    try {
      const deletedPostId = await social.deleteComment(commentId, request.session.userId!, postId);
      if (deletedPostId !== postId) {
        response.status(404).json({ status: 'error', message: 'Comment not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId!);
      response.status(200).json({
        status: 'ok',
        commentCount: stats.get(postId)?.commentsCount ?? 0,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:postId/repost', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = parseId(request.params.postId);
    if (!postId) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const change = await social.changeRepost(postId, request.session.userId!, true);
      if (change.result === 'not_found') {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId!);
      const repostActivity = change.repostId
        ? await social.getRepostActivity(change.repostId)
        : null;
      response.status(200).json({
        status: 'ok',
        ...stats.get(postId),
        repostActivity,
        repostChanged: change.result === 'changed',
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:postId/repost', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = parseId(request.params.postId);
    if (!postId) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const change = await social.changeRepost(postId, request.session.userId!, false);
      if (change.result === 'not_found') {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId!);
      response.status(200).json({
        status: 'ok',
        ...stats.get(postId),
        removedRepostId: change.repostId ?? null,
        repostChanged: change.result === 'changed',
      });
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

function parseId(value: unknown): string | null {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value : null;
}

function validateComment(body: unknown): string | null {
  if (!isRecord(body) || Object.keys(body).length !== 1 || typeof body.text !== 'string') return null;
  const text = body.text.trim();
  return text.length > 0 && text.length <= COMMENT_MAX_LENGTH ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
