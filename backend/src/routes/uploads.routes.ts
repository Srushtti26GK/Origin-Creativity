import { Router } from 'express';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { createCsrfProtection } from '../middleware/csrf.js';
import type { ImageStorage } from '../services/cloudinaryImageStorage.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createUploadsRouter(storage: ImageStorage, allowedOrigins: string[]) {
  const router = Router();
  const parseUpload = createUploadParser();

  router.post(
    '/images',
    requireAuthenticated,
    createCsrfProtection(allowedOrigins),
    parseUpload,
    async (request, response) => {
      const uploadId = request.get('idempotency-key');
      if (!uploadId || !UUID_PATTERN.test(uploadId)) {
        response.status(400).json({ status: 'error', message: 'A valid Idempotency-Key is required.' });
        return;
      }
      if (!storage.configured) {
        response.status(503).json({ status: 'error', message: 'Image uploads are not configured.' });
        return;
      }
      if (!request.file || !isSupportedImage(request.file.buffer, request.file.mimetype)) {
        response.status(400).json({ status: 'error', message: 'Choose a valid JPEG, PNG, WebP, or GIF image.' });
        return;
      }

      try {
        const asset = await storage.upload(request.session.userId!, uploadId, request.file.buffer);
        response.status(201).json({
          status: 'ok',
          asset: { ...asset, type: 'image' },
        });
      } catch (error) {
        logUploadFailure(error);
        response.status(502).json({ status: 'error', message: 'Image upload failed. Please retry.' });
      }
    },
  );

  return router;
}

function logUploadFailure(error: unknown) {
  const details: { errorType?: string; providerStatus?: number; networkCode?: string } = {};
  if (error instanceof Error && /^(?:Error|[A-Za-z]+Error)$/.test(error.name)) {
    details.errorType = error.name;
  }
  if (typeof error === 'object' && error !== null) {
    const providerStatus = 'http_code' in error ? error.http_code : undefined;
    if (typeof providerStatus === 'number' && Number.isInteger(providerStatus)) {
      details.providerStatus = providerStatus;
    }
    const code = 'code' in error ? error.code : undefined;
    if (
      typeof code === 'string'
      && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(code)
    ) {
      details.networkCode = code;
    }
  }
  console.error('Cloudinary image upload failed.', details);
}

export async function verifyUploadedMedia(
  storage: ImageStorage,
  userId: string,
  media: Array<{ uploadId?: string; url: string }>,
) {
  for (const item of media) {
    if (item.uploadId && !(await storage.verifyOwned(userId, item.uploadId, item.url))) return false;
  }
  return true;
}

const requireAuthenticated: RequestHandler = (request, response, next) => {
  if (!request.session.userId) {
    response.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }
  next();
};

function createUploadParser(): RequestHandler {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    fileFilter(_request, file, callback) {
      if (!SUPPORTED_TYPES.has(file.mimetype)) {
        callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
        return;
      }
      callback(null, true);
    },
  }).single('image');

  return (request, response, next) => {
    parser(request, response, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        response.status(413).json({ status: 'error', message: 'Images must be 5 MB or smaller.' });
        return;
      }
      response.status(400).json({ status: 'error', message: 'Choose one supported image file.' });
    });
  };
}

function isSupportedImage(buffer: Buffer, mimeType: string) {
  if (!SUPPORTED_TYPES.has(mimeType)) return false;
  if (mimeType === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/gif') return buffer.subarray(0, 3).toString('ascii') === 'GIF';
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}
