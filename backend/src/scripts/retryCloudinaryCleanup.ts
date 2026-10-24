import { pool } from '../config/database.js';
import { createPostRepository } from '../repositories/post.repository.js';
import { cloudinaryImageStorage } from '../services/cloudinaryImageStorage.js';
import { runCloudinaryCleanupBatch } from '../services/cloudinaryCleanup.js';

const posts = createPostRepository(pool);

try {
  const result = await runCloudinaryCleanupBatch(posts, cloudinaryImageStorage);
  console.info('Cloudinary cleanup batch result.', result);
  if (!result.fullyDrained) process.exitCode = 1;
} catch (error) {
  console.error('Could not load pending Cloudinary cleanup work.', {
    errorType: error instanceof Error ? error.name : 'UnknownError',
  });
  process.exitCode = 1;
} finally {
  await pool.end();
}
