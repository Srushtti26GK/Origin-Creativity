import type { PostRepository } from '../repositories/post.repository.js';
import type { ImageStorage } from './cloudinaryImageStorage.js';

export const CLOUDINARY_CLEANUP_BATCH_SIZE = 100;

export interface CloudinaryCleanupBatchResult {
  attempted: number;
  failed: number;
  unresolved: number;
  moreQueued: boolean;
  batchSucceeded: boolean;
  fullyDrained: boolean;
}

type CleanupRepository = Pick<
  PostRepository,
  | 'listPendingMediaCleanup'
  | 'listUnresolvedMediaCleanup'
  | 'completeMediaCleanup'
  | 'recordMediaCleanupFailure'
>;

type CleanupStorage = Pick<ImageStorage, 'deleteAsset'>;

export async function runCloudinaryCleanupBatch(
  posts: CleanupRepository,
  storage: CleanupStorage,
): Promise<CloudinaryCleanupBatchResult> {
  const [pendingPublicIds, unresolvedUrls] = await Promise.all([
    posts.listPendingMediaCleanup(CLOUDINARY_CLEANUP_BATCH_SIZE + 1),
    posts.listUnresolvedMediaCleanup(CLOUDINARY_CLEANUP_BATCH_SIZE + 1),
  ]);
  const batch = pendingPublicIds.slice(0, CLOUDINARY_CLEANUP_BATCH_SIZE);
  let failed = 0;

  for (const publicId of batch) {
    try {
      await storage.deleteAsset(publicId);
      await posts.completeMediaCleanup(publicId);
    } catch (error) {
      failed += 1;
      await posts.recordMediaCleanupFailure(
        publicId,
        error instanceof Error ? error.name : 'UnknownError',
      );
      console.error('Cloudinary cleanup remains pending.', {
        publicId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  // Recheck after processing so failed items and assets queued during the
  // batch cannot be reported as fully drained.
  const [remainingPublicIds, remainingUnresolvedUrls] = await Promise.all([
    posts.listPendingMediaCleanup(1),
    posts.listUnresolvedMediaCleanup(1),
  ]);
  const moreQueued = pendingPublicIds.length > batch.length
    || unresolvedUrls.length > CLOUDINARY_CLEANUP_BATCH_SIZE
    || remainingPublicIds.length > 0
    || remainingUnresolvedUrls.length > 0;
  const fullyDrained = failed === 0 && !moreQueued;

  return {
    attempted: batch.length,
    failed,
    unresolved: unresolvedUrls.length,
    moreQueued,
    batchSucceeded: failed === 0,
    fullyDrained,
  };
}
