import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createCsrfProtection } from '../middleware/csrf.js';
import type {
  NewPost,
  PostMediaInput,
  PostRepository,
  PostUpdates,
} from '../repositories/post.repository.js';
import type { ImageStorage } from '../services/cloudinaryImageStorage.js';
import { cloudinaryPublicIdFor } from '../services/cloudinaryImageStorage.js';
import { verifyUploadedMedia } from './uploads.routes.js';
import type { SocialRepository } from '../repositories/social.repository.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  'painting', 'illustration', 'photography', 'pottery', 'poetry',
  'music', 'dance', 'digital', 'crafts',
]);
const MEDIA_TYPES = new Set(['image', 'audio', 'video']);

export function createPostsRouter(
  posts: PostRepository,
  allowedOrigins: string[],
  imageStorage: ImageStorage,
  social: SocialRepository,
) {
  const router = Router();
  const requireCsrf = createCsrfProtection(allowedOrigins);

  router.get('/:postId/inspired-works', async (request, response, next) => {
    const postId = request.params.postId;
    if (typeof postId !== 'string' || !isUuid(postId)) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const source = await posts.findById(postId);
      if (!source) {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const works = await posts.listInspiredWorks(postId);
      const stats = await social.getPostStats(works.map((work) => work.id), request.session.userId ?? null);
      response.status(200).json({
        status: 'ok',
        posts: works.map((work) => ({ ...work, ...stats.get(work.id) })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (request, response, next) => {
    const pagination = parsePagination(request.query.page, request.query.limit);
    if (!pagination) {
      response.status(400).json({
        status: 'error',
        message: `page must be a positive integer and limit must be between 1 and ${MAX_PAGE_SIZE}.`,
      });
      return;
    }
    try {
      const result = await posts.list(
        pagination.pageSize,
        (pagination.page - 1) * pagination.pageSize,
      );
      const stats = await social.getPostStats(result.posts.map((post) => post.id), request.session.userId ?? null);
      response.status(200).json({
        status: 'ok',
        posts: result.posts.map((post) => ({ ...post, ...stats.get(post.id) })),
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

  router.get('/:postId', async (request, response, next) => {
    const postId = request.params.postId;
    if (typeof postId !== 'string' || !isUuid(postId)) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const post = await posts.findById(postId);
      if (!post) {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([postId], request.session.userId ?? null);
      response.status(200).json({ status: 'ok', post: { ...post, ...stats.get(postId) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const input = validateNewPost(request.body, request.session.userId!);
    if (!input) {
      response.status(400).json({ status: 'error', message: 'Invalid post data' });
      return;
    }
    try {
      input.media = withStoredPublicIds(input.media, request.session.userId!);
      const post = await posts.create(input, () => verifyUploadedMedia(imageStorage, request.session.userId!, input.media));
      const stats = await social.getPostStats([post.id], request.session.userId!);
      response.status(201).json({ status: 'ok', post: { ...post, ...stats.get(post.id) } });
    } catch (error) {
      if (isSourceMissing(error)) {
        response.status(404).json({ status: 'error', message: 'Source post not found' });
        return;
      }
      if (isConstraintError(error)) {
        response.status(400).json({ status: 'error', message: 'Post data violates a schema constraint' });
        return;
      }
      if (isInvalidUploadedMedia(error)) {
        response.status(400).json({ status: 'error', message: 'An uploaded image is invalid or does not belong to your account.' });
        return;
      }
      next(error);
    }
  });

  router.patch('/:postId', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = request.params.postId;
    if (typeof postId !== 'string' || !isUuid(postId)) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    const updates = validateUpdates(request.body);
    if (!updates) {
      response.status(400).json({ status: 'error', message: 'Invalid post update' });
      return;
    }
    try {
      if (updates.media) updates.media = withStoredPublicIds(updates.media, request.session.userId!);
      const post = await posts.update(
        postId,
        request.session.userId!,
        updates,
        updates.media
          ? () => verifyUploadedMedia(imageStorage, request.session.userId!, updates.media!)
          : undefined,
      );
      if (!post) {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const stats = await social.getPostStats([post.id], request.session.userId!);
      response.status(200).json({ status: 'ok', post: { ...post, ...stats.get(post.id) } });
    } catch (error) {
      if (isConstraintError(error)) {
        response.status(400).json({ status: 'error', message: 'Post data violates a schema constraint' });
        return;
      }
      if (isInvalidUploadedMedia(error)) {
        response.status(400).json({ status: 'error', message: 'An uploaded image is invalid or does not belong to your account.' });
        return;
      }
      next(error);
    }
  });

  router.delete('/:postId', requireAuthenticated, requireCsrf, async (request, response, next) => {
    const postId = request.params.postId;
    if (typeof postId !== 'string' || !isUuid(postId)) {
      response.status(400).json({ status: 'error', message: 'Invalid post ID' });
      return;
    }
    try {
      const deletion = await posts.delete(postId, request.session.userId!);
      if (!deletion.deleted) {
        response.status(404).json({ status: 'error', message: 'Post not found' });
        return;
      }
      const failedPublicIds: string[] = [];
      for (const publicId of deletion.cleanupPublicIds) {
        try {
          await imageStorage.deleteAsset(publicId);
          await posts.completeMediaCleanup(publicId);
        } catch (error) {
          failedPublicIds.push(publicId);
          await posts.recordMediaCleanupFailure(publicId, cleanupErrorName(error));
          console.error('Cloudinary cleanup is pending for a deleted post asset.', {
            publicId,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          });
        }
      }
      if (failedPublicIds.length || deletion.unresolvedMediaUrls.length) {
        if (deletion.unresolvedMediaUrls.length) {
          console.error('Legacy Cloudinary media is retained for manual cleanup because its public ID was not stored.', {
            mediaCount: deletion.unresolvedMediaUrls.length,
          });
        }
        response.status(202).json({
          status: 'ok',
          message: deletion.unresolvedMediaUrls.length
            ? 'Post deleted, but legacy Cloudinary media without stored public IDs needs manual cleanup.'
            : 'Post deleted, but Cloudinary media cleanup is pending.',
          cleanupPending: true,
        });
        return;
      }
      response.status(200).json({
        status: 'ok',
        message: 'Post and its tracked media were permanently deleted.',
        cleanupPending: false,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function withStoredPublicIds(media: PostMediaInput[], userId: string): PostMediaInput[] {
  return media.map((item) => ({
    ...item,
    cloudinaryPublicId: item.type === 'image' && item.uploadId
      ? cloudinaryPublicIdFor(userId, item.uploadId)
      : null,
  }));
}

function cleanupErrorName(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError';
}

const requireAuthenticated: RequestHandler = (request, response, next) => {
  if (!request.session.userId) {
    response.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }
  next();
};

function validateNewPost(body: unknown, userId: string): NewPost | null {
  if (!isRecord(body)) return null;
  const allowedFields = new Set([
    'title', 'description', 'category', 'tags', 'workType',
    'sourcePostId', 'inspirationNote', 'media',
  ]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) return null;
  const title = string(body.title)?.trim() ?? '';
  const description = string(body.description)?.trim() ?? '';
  const category = string(body.category) ?? '';
  const tags = validateTags(body.tags);
  const workType = body.workType;
  const sourcePostId = body.sourcePostId === null || body.sourcePostId === ''
    ? null
    : string(body.sourcePostId);
  const inspirationNote = body.inspirationNote === null || body.inspirationNote === ''
    ? null
    : string(body.inspirationNote)?.trim() ?? null;
  const media = validateMedia(body.media);

  if (
    title.length < 1 || title.length > 80
    || description.length < 10 || description.length > 600
    || !CATEGORIES.has(category)
    || !tags
    || (workType !== 'original' && workType !== 'inspired')
    || (workType === 'original' && (sourcePostId !== null || inspirationNote !== null))
    || (workType === 'inspired' && (
      !sourcePostId || !isUuid(sourcePostId) || !inspirationNote || inspirationNote.length > 600
    ))
    || !media
  ) return null;

  return {
    userId,
    title,
    description,
    category,
    tags,
    workType,
    sourcePostId,
    inspirationNote,
    media,
  };
}

function validateUpdates(body: unknown): PostUpdates | null {
  if (!isRecord(body)) return null;
  const keys = Object.keys(body);
  const allowed = new Set(['title', 'description', 'category', 'tags', 'inspirationNote', 'media']);
  if (keys.length === 0 || keys.some((key) => !allowed.has(key))) return null;

  const updates: PostUpdates = {};
  if ('title' in body) {
    const title = string(body.title)?.trim();
    if (!title || title.length > 80) return null;
    updates.title = title;
  }
  if ('description' in body) {
    const description = string(body.description)?.trim();
    if (!description || description.length < 10 || description.length > 600) return null;
    updates.description = description;
  }
  if ('category' in body) {
    if (typeof body.category !== 'string' || !CATEGORIES.has(body.category)) return null;
    updates.category = body.category;
  }
  if ('tags' in body) {
    const tags = validateTags(body.tags);
    if (!tags) return null;
    updates.tags = tags;
  }
  if ('inspirationNote' in body) {
    if (typeof body.inspirationNote !== 'string') return null;
    const note = body.inspirationNote.trim();
    if (note.length === 0 || note.length > 600) return null;
    updates.inspirationNote = note;
  }
  if ('media' in body) {
    const media = validateMedia(body.media);
    if (!media) return null;
    updates.media = media;
  }
  return updates;
}

function validateTags(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 8) return null;
  if (value.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) return null;
  return [...new Set(value.map((tag: string) => tag.trim().toLowerCase()))];
}

const MIN_MEDIA_FILES = 1;
const MAX_MEDIA_FILES = 5;

function validateMedia(value: unknown): PostMediaInput[] | null {
  if (!Array.isArray(value) || value.length < MIN_MEDIA_FILES || value.length > MAX_MEDIA_FILES) return null;
  const media: PostMediaInput[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const type = item.type;
    const url = string(item.url)?.trim() ?? '';
    const alt = item.alt === null || item.alt === undefined ? null : string(item.alt);
    const aspect = item.aspect === null || item.aspect === undefined ? null : string(item.aspect);
    const uploadId = item.uploadId === undefined ? undefined : string(item.uploadId);
    if (
      typeof type !== 'string' || !MEDIA_TYPES.has(type)
      || !url || url.length > 2048
      || (alt !== null && alt.length > 500)
      || (aspect !== null && aspect.length > 30)
      || (uploadId !== undefined && (!uploadId || !UUID_PATTERN.test(uploadId)))
    ) return null;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    } catch {
      return null;
    }
    media.push({ type: type as PostMediaInput['type'], url, alt, aspect, ...(uploadId ? { uploadId } : {}) });
  }
  return media;
}

function parsePagination(pageValue: unknown, limitValue: unknown) {
  const page = parsePositiveInteger(pageValue, DEFAULT_PAGE);
  const pageSize = parsePositiveInteger(limitValue, DEFAULT_PAGE_SIZE);
  if (
    page === null || pageSize === null || pageSize > MAX_PAGE_SIZE
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isConstraintError(error: unknown): error is { code: string } {
  return isRecord(error) && typeof error.code === 'string' && error.code === '23514';
}

function isInvalidUploadedMedia(error: unknown): error is { code: string } {
  return isRecord(error) && error.code === 'INVALID_UPLOADED_MEDIA';
}

function isSourceMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'SOURCE_POST_NOT_FOUND';
}
