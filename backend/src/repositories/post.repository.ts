import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface PostMediaInput {
  type: 'image' | 'audio' | 'video';
  url: string;
  alt: string | null;
  aspect: string | null;
  uploadId?: string;
  cloudinaryPublicId?: string | null;
}

export interface NewPost {
  userId: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  workType: 'original' | 'inspired';
  sourcePostId: string | null;
  inspirationNote: string | null;
  media: PostMediaInput[];
}

export interface PostUpdates {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  inspirationNote?: string | null;
  media?: PostMediaInput[];
}

export interface PostRecord {
  id: string;
  feedEntryId?: string;
  repostedBy?: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    createdAt: Date;
  } | null;
  title: string;
  description: string;
  creatorId: string;
  category: string;
  tags: string[];
  media: PostMediaInput[];
  workType: string;
  sourcePostId: string | null;
  inspirationNote: string | null;
  authenticity: {
    declaration: string | null;
    verificationStatus: string;
  };
  likesCount: number;
  createdAt: Date;
  creator: {
    id: string;
    username: string;
    name: string;
    handle: string;
    bio: string | null;
    avatarUrl: string | null;
  };
}

export interface PostRepository {
  list(pageSize: number, offset: number): Promise<{ posts: PostRecord[]; total: number }>;
  findById(id: string): Promise<PostRecord | null>;
  listInspiredWorks(sourcePostId: string): Promise<PostRecord[]>;
  create(post: NewPost, verifyMedia?: () => Promise<boolean>): Promise<PostRecord>;
  update(id: string, userId: string, updates: PostUpdates, verifyMedia?: () => Promise<boolean>): Promise<PostRecord | null>;
  delete(id: string, userId: string): Promise<{
    deleted: boolean;
    cleanupPublicIds: string[];
    unresolvedMediaUrls: string[];
  }>;
  completeMediaCleanup(publicId: string): Promise<void>;
  recordMediaCleanupFailure(publicId: string, reason: string): Promise<void>;
  listPendingMediaCleanup(limit: number): Promise<string[]>;
  listUnresolvedMediaCleanup(limit: number): Promise<string[]>;
}

interface PostRow {
  id: string;
  title: string;
  description: string;
  user_id: string;
  category: string;
  tags: string[];
  work_type: string;
  source_post_id: string | null;
  inspiration_note: string | null;
  authenticity_declaration: string | null;
  verification_status: string;
  created_at: Date;
  creator_username: string;
  creator_display_name: string;
  creator_bio: string | null;
  creator_avatar_url: string | null;
  media: PostMediaInput[];
  feed_entry_id?: string;
  activity_at?: Date;
  reposter_id?: string | null;
  reposter_username?: string | null;
  reposter_display_name?: string | null;
  reposter_avatar_url?: string | null;
}

interface StoredMediaRow {
  media_type: PostMediaInput['type'];
  media_url: string;
  cloudinary_public_id: string | null;
  alt_text: string | null;
  aspect: string | null;
  position: number;
}

const POST_SELECT = `
  SELECT
    p.id, p.title, p.description, p.user_id, p.category, p.tags, p.work_type,
    p.source_post_id, p.inspiration_note, p.authenticity_declaration,
    p.verification_status, p.created_at,
    u.username AS creator_username, u.display_name AS creator_display_name,
    u.bio AS creator_bio, u.avatar_url AS creator_avatar_url,
    COALESCE(
      json_agg(json_build_object(
        'type', m.media_type, 'url', m.media_url, 'alt', m.alt_text, 'aspect', m.aspect
      ) ORDER BY m.position) FILTER (WHERE m.id IS NOT NULL),
      '[]'::json
    ) AS media
  FROM posts p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN post_media m ON m.post_id = p.id
`;

function mapPost(row: PostRow): PostRecord {
  return {
    id: row.id,
    ...(row.feed_entry_id ? { feedEntryId: row.feed_entry_id } : {}),
    repostedBy: row.reposter_id && row.activity_at ? {
      id: row.reposter_id,
      username: row.reposter_username ?? '',
      displayName: row.reposter_display_name ?? '',
      avatarUrl: row.reposter_avatar_url ?? null,
      createdAt: row.activity_at,
    } : null,
    title: row.title,
    description: row.description,
    creatorId: row.user_id,
    category: row.category,
    tags: row.tags,
    media: row.media,
    workType: row.work_type,
    sourcePostId: row.source_post_id,
    inspirationNote: row.inspiration_note,
    authenticity: {
      declaration: row.authenticity_declaration,
      verificationStatus: row.verification_status,
    },
    likesCount: 0,
    createdAt: row.created_at,
    creator: {
      id: row.user_id,
      username: row.creator_username,
      name: row.creator_display_name,
      handle: row.creator_username,
      bio: row.creator_bio,
      avatarUrl: row.creator_avatar_url,
    },
  };
}

async function selectPost(queryable: Pick<PoolClient, 'query'>, id: string, userId?: string) {
  const ownershipClause = userId === undefined ? '' : 'AND p.user_id = $2';
  const values = userId === undefined ? [id] : [id, userId];
  const result = await queryable.query<PostRow>(
    `${POST_SELECT}
     WHERE p.id = $1 AND p.deleted_at IS NULL ${ownershipClause}
     GROUP BY p.id, u.id`,
    values,
  );
  return result.rows[0] ? mapPost(result.rows[0]) : null;
}

export function createPostRepository(pool: Pick<Pool, 'query' | 'connect'>): PostRepository {
  return {
    async list(pageSize, offset) {
      const [postsResult, countResult] = await Promise.all([
        pool.query<PostRow>(
          `WITH feed AS (
             SELECT p.id AS post_id, 'post:' || p.id::text AS feed_entry_id,
                    p.created_at AS activity_at, NULL::uuid AS reposter_id,
                    NULL::text AS reposter_username, NULL::text AS reposter_display_name,
                    NULL::text AS reposter_avatar_url
             FROM posts p
             WHERE p.deleted_at IS NULL
             UNION ALL
             SELECT p.id, 'repost:' || r.id::text, r.created_at, ru.id,
                    ru.username, ru.display_name, ru.avatar_url
             FROM reposts r
             JOIN posts p ON p.id = r.post_id AND p.deleted_at IS NULL
             JOIN users ru ON ru.id = r.user_id
           )
           SELECT
             p.id, p.title, p.description, p.user_id, p.category, p.tags, p.work_type,
             p.source_post_id, p.inspiration_note, p.authenticity_declaration,
             p.verification_status, p.created_at,
             u.username AS creator_username, u.display_name AS creator_display_name,
             u.bio AS creator_bio, u.avatar_url AS creator_avatar_url,
             feed.feed_entry_id, feed.activity_at, feed.reposter_id,
             feed.reposter_username, feed.reposter_display_name, feed.reposter_avatar_url,
             COALESCE(
               json_agg(json_build_object(
                 'type', m.media_type, 'url', m.media_url, 'alt', m.alt_text, 'aspect', m.aspect
               ) ORDER BY m.position) FILTER (WHERE m.id IS NOT NULL),
               '[]'::json
             ) AS media
           FROM feed
           JOIN posts p ON p.id = feed.post_id
           JOIN users u ON u.id = p.user_id
           LEFT JOIN post_media m ON m.post_id = p.id
           GROUP BY p.id, u.id, feed.feed_entry_id, feed.activity_at, feed.reposter_id,
                    feed.reposter_username, feed.reposter_display_name, feed.reposter_avatar_url
           ORDER BY feed.activity_at DESC, feed.feed_entry_id DESC
           LIMIT $1 OFFSET $2`,
          [pageSize, offset],
        ),
        pool.query<{ total: string }>(
          `SELECT (
             (SELECT COUNT(*) FROM posts WHERE deleted_at IS NULL)
             + (SELECT COUNT(*) FROM reposts r JOIN posts p ON p.id = r.post_id WHERE p.deleted_at IS NULL)
           )::text AS total`,
        ),
      ]);
      return {
        posts: postsResult.rows.map(mapPost),
        total: Number(countResult.rows[0]?.total ?? 0),
      };
    },
    async findById(id) {
      return selectPost(pool, id);
    },
    async listInspiredWorks(sourcePostId) {
      const result = await pool.query<PostRow>(
        `${POST_SELECT}
         WHERE p.source_post_id = $1 AND p.deleted_at IS NULL
         GROUP BY p.id, u.id
         ORDER BY p.created_at DESC, p.id DESC`,
        [sourcePostId],
      );
      return result.rows.map(mapPost);
    },
    async create(post, verifyMedia) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const id = randomUUID();
        if (post.sourcePostId) {
          const source = await client.query(
            'SELECT id FROM posts WHERE id = $1 AND deleted_at IS NULL FOR SHARE',
            [post.sourcePostId],
          );
          if (!source.rows[0]) {
            throw Object.assign(new Error('Source post not found'), { code: 'SOURCE_POST_NOT_FOUND' });
          }
        }
        await lockMediaAssets(client, post.media);
        await assertMediaCleanupNotPending(client, post.media);
        if (verifyMedia && !(await verifyMedia())) throw invalidMediaReferenceError();
        await client.query(
          `INSERT INTO posts (
             id, user_id, title, description, category, tags, work_type,
             source_post_id, inspiration_note, authenticity_declaration
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $7)`,
          [
            id,
            post.userId,
            post.title,
            post.description,
            post.category,
            post.tags,
            post.workType,
            post.sourcePostId,
            post.inspirationNote,
          ],
        );
        for (const [position, media] of post.media.entries()) {
          await client.query(
            `INSERT INTO post_media (
               id, post_id, media_type, media_url, alt_text, aspect, position, cloudinary_public_id
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              randomUUID(), id, media.type, media.url, media.alt, media.aspect, position,
              media.cloudinaryPublicId ?? null,
            ],
          );
        }
        const created = await selectPost(client, id, post.userId);
        if (!created) throw new Error('Created post could not be read.');
        await client.query('COMMIT');
        return created;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async update(id, userId, updates, verifyMedia) {
      const columns: string[] = [];
      const values: unknown[] = [id, userId];
      if (updates.title !== undefined) {
        values.push(updates.title);
        columns.push(`title = $${values.length}`);
      }
      if (updates.description !== undefined) {
        values.push(updates.description);
        columns.push(`description = $${values.length}`);
      }
      if (updates.category !== undefined) {
        values.push(updates.category);
        columns.push(`category = $${values.length}`);
      }
      if (updates.tags !== undefined) {
        values.push(updates.tags);
        columns.push(`tags = $${values.length}`);
      }
      if (updates.inspirationNote !== undefined) {
        values.push(updates.inspirationNote);
        columns.push(`inspiration_note = $${values.length}`);
      }
      if (columns.length === 0 && updates.media === undefined) return null;
      const client = updates.media === undefined ? null : await pool.connect();
      const queryable = client ?? pool;
      try {
        let previousMedia: StoredMediaRow[] = [];
        if (client) {
          await client.query('BEGIN');
          const post = await client.query(
            'SELECT id FROM posts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE',
            [id, userId],
          );
          if (!post.rowCount) {
            await client.query('ROLLBACK');
            return null;
          }
          const existingMedia = await client.query<StoredMediaRow>(
            `SELECT media_type, media_url, cloudinary_public_id, alt_text, aspect, position
             FROM post_media WHERE post_id = $1 ORDER BY position FOR UPDATE`,
            [id],
          );
          previousMedia = existingMedia.rows;
          updates.media = restoreExistingMediaIds(updates.media!, previousMedia);
          await lockMediaAssets(client, [
            ...previousMedia.map(storedMediaInput),
            ...updates.media,
          ]);
          await assertMediaCleanupNotPending(client, updates.media);
          if (verifyMedia && !(await verifyMedia())) throw invalidMediaReferenceError();
        }
        if (columns.length > 0) {
          const update = await queryable.query(
            `UPDATE posts SET ${columns.join(', ')}, updated_at = now()
             WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
            values,
          );
          if (!update.rowCount) {
            if (client) await client.query('ROLLBACK');
            return null;
          }
        } else {
          const existing = await queryable.query(
            'SELECT id FROM posts WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
            [id, userId],
          );
          if (!existing.rowCount) {
            if (client) await client.query('ROLLBACK');
            return null;
          }
        }
        if (updates.media !== undefined) {
          if (!client) throw new Error('Media updates require a database transaction.');
          const retained = new Set(updates.media.flatMap((item) => [
            ...(item.cloudinaryPublicId ? [`id:${item.cloudinaryPublicId}`] : []),
            `url:${item.url}`,
          ]));
          const removed = previousMedia.filter((item) => !retained.has(mediaIdentity(item)));
          await queryable.query('DELETE FROM post_media WHERE post_id = $1', [id]);
          for (const [position, media] of updates.media.entries()) {
            await queryable.query(
              `INSERT INTO post_media (
                 id, post_id, media_type, media_url, alt_text, aspect, position, cloudinary_public_id
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                randomUUID(), id, media.type, media.url, media.alt, media.aspect, position,
                media.cloudinaryPublicId ?? null,
              ],
            );
          }
          await queueRemovedMediaCleanup(client, id, removed, updates.media);
        }
        const updated = await selectPost(queryable, id, userId);
        if (client) await client.query('COMMIT');
        return updated;
      } catch (error) {
        if (client) await client.query('ROLLBACK');
        throw error;
      } finally {
        client?.release();
      }
    },
    async delete(id, userId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const post = await client.query(
          'SELECT id FROM posts WHERE id = $1 AND user_id = $2 FOR UPDATE',
          [id, userId],
        );
        if (!post.rowCount) {
          await client.query('ROLLBACK');
          return { deleted: false, cleanupPublicIds: [], unresolvedMediaUrls: [] };
        }

        const media = await client.query<StoredMediaRow>(
          `SELECT media_type, media_url, cloudinary_public_id, alt_text, aspect, position
           FROM post_media WHERE post_id = $1 ORDER BY position FOR UPDATE`,
          [id],
        );
        const targetMedia = media.rows;
        await lockMediaAssets(client, targetMedia.map(storedMediaInput));
        const cleanup = await findUnreferencedMedia(client, id, targetMedia);
        const cleanupPublicIds = cleanup.publicIds;
        const unresolvedMediaUrls = cleanup.unresolvedUrls;
        for (const publicId of cleanupPublicIds) {
          await enqueuePublicIdCleanup(client, publicId);
        }
        for (const mediaUrl of unresolvedMediaUrls) {
          await enqueueUnresolvedUrlCleanup(client, mediaUrl);
        }

        await client.query('UPDATE posts SET source_post_id = NULL WHERE source_post_id = $1', [id]);
        await client.query('DELETE FROM likes WHERE post_id = $1', [id]);
        await client.query('DELETE FROM comments WHERE post_id = $1', [id]);
        await client.query('DELETE FROM reposts WHERE post_id = $1', [id]);
        await client.query('UPDATE notifications SET post_id = NULL WHERE post_id = $1', [id]);
        const deleted = await client.query(
          'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING id',
          [id, userId],
        );
        if (!deleted.rowCount) throw new Error('Post disappeared during deletion.');
        await client.query('COMMIT');
        return { deleted: true, cleanupPublicIds, unresolvedMediaUrls };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async completeMediaCleanup(publicId) {
      await pool.query('DELETE FROM cloudinary_cleanup WHERE public_id = $1', [publicId]);
    },
    async recordMediaCleanupFailure(publicId, reason) {
      await pool.query(
        `UPDATE cloudinary_cleanup
         SET attempts = attempts + 1, last_error = $2, updated_at = now()
         WHERE public_id = $1`,
        [publicId, reason],
      );
    },
    async listPendingMediaCleanup(limit) {
      const result = await pool.query<{ public_id: string }>(
        `SELECT public_id FROM cloudinary_cleanup
         ORDER BY updated_at ASC, created_at ASC, public_id ASC
         LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => row.public_id);
    },
    async listUnresolvedMediaCleanup(limit) {
      const result = await pool.query<{ media_url: string }>(
        `SELECT media_url FROM cloudinary_cleanup_unresolved
         ORDER BY created_at ASC, media_url ASC
         LIMIT $1`,
        [limit],
      );
      return result.rows.map((row) => row.media_url);
    },
  };
}

async function lockMediaAssets(client: PoolClient, media: PostMediaInput[]) {
  await lockPublicIds(client, media.flatMap((item) => [
    ...(item.cloudinaryPublicId ? [item.cloudinaryPublicId] : []),
    `url:${item.url}`,
  ]));
}

function storedMediaInput(media: StoredMediaRow): PostMediaInput {
  return {
    type: media.media_type,
    url: media.media_url,
    alt: media.alt_text,
    aspect: media.aspect,
    cloudinaryPublicId: media.cloudinary_public_id,
  };
}

function mediaIdentity(media: PostMediaInput | StoredMediaRow): string {
  const isStored = 'media_url' in media;
  const publicId = isStored ? media.cloudinary_public_id : media.cloudinaryPublicId;
  const url = isStored ? media.media_url : media.url;
  return publicId ? `id:${publicId}` : `url:${url}`;
}

function restoreExistingMediaIds(
  requested: PostMediaInput[],
  existing: StoredMediaRow[],
): PostMediaInput[] {
  const unmatched = [...existing];
  return requested.map((item) => {
    if (item.cloudinaryPublicId) {
      const match = unmatched.findIndex((stored) => stored.cloudinary_public_id === item.cloudinaryPublicId);
      if (match >= 0) unmatched.splice(match, 1);
      return item;
    }
    if (item.uploadId) return item;
    const match = unmatched.findIndex((stored) => (
      stored.media_type === item.type && stored.media_url === item.url
    ));
    if (match < 0) return item;
    const [stored] = unmatched.splice(match, 1);
    return { ...item, cloudinaryPublicId: stored.cloudinary_public_id };
  });
}

async function queueRemovedMediaCleanup(
  client: PoolClient,
  postId: string,
  removed: StoredMediaRow[],
  retained: PostMediaInput[],
) {
  for (const item of removed) {
    const publicId = item.cloudinary_public_id;
    if (publicId) {
      if (retained.some((media) => (
        media.cloudinaryPublicId === publicId || media.url === item.media_url
      ))) continue;
      const shared = await client.query(
        `SELECT 1 FROM post_media
         WHERE post_id <> $1
           AND (cloudinary_public_id = $2 OR media_url = $3)
         LIMIT 1`,
        [postId, publicId, item.media_url],
      );
      if (!shared.rowCount) await enqueuePublicIdCleanup(client, publicId);
      continue;
    }

    if (item.media_type !== 'image' || !item.media_url.startsWith('https://res.cloudinary.com/')) continue;
    if (removed.some((candidate) => (
      candidate !== item && candidate.cloudinary_public_id && candidate.media_url === item.media_url
    ))) continue;
    if (retained.some((media) => media.url === item.media_url)) continue;
    const shared = await client.query(
      'SELECT 1 FROM post_media WHERE post_id <> $1 AND media_url = $2 LIMIT 1',
      [postId, item.media_url],
    );
    if (!shared.rowCount) await enqueueUnresolvedUrlCleanup(client, item.media_url);
  }
}

async function findUnreferencedMedia(
  client: PoolClient,
  postId: string,
  media: StoredMediaRow[],
) {
  const publicIdUrls = new Map<string, Set<string>>();
  const unresolvedUrls = new Set<string>();
  const trackedUrls = new Set(media.flatMap((item) => (
    item.cloudinary_public_id ? [item.media_url] : []
  )));
  for (const item of media) {
    if (item.cloudinary_public_id) {
      const urls = publicIdUrls.get(item.cloudinary_public_id) ?? new Set<string>();
      urls.add(item.media_url);
      publicIdUrls.set(item.cloudinary_public_id, urls);
    } else if (
      item.media_type === 'image'
      && item.media_url.startsWith('https://res.cloudinary.com/')
      && !trackedUrls.has(item.media_url)
    ) {
      unresolvedUrls.add(item.media_url);
    }
  }

  const cleanupPublicIds: string[] = [];
  for (const [publicId, urls] of publicIdUrls) {
    const shared = await client.query(
      `SELECT 1 FROM post_media
       WHERE post_id <> $1
         AND (cloudinary_public_id = $2 OR media_url = ANY($3::text[]))
       LIMIT 1`,
      [postId, publicId, [...urls]],
    );
    if (!shared.rowCount) cleanupPublicIds.push(publicId);
  }

  const cleanupUnresolvedUrls: string[] = [];
  for (const mediaUrl of unresolvedUrls) {
    const shared = await client.query(
      'SELECT 1 FROM post_media WHERE post_id <> $1 AND media_url = $2 LIMIT 1',
      [postId, mediaUrl],
    );
    if (!shared.rowCount) cleanupUnresolvedUrls.push(mediaUrl);
  }
  return { publicIds: cleanupPublicIds, unresolvedUrls: cleanupUnresolvedUrls };
}

async function enqueuePublicIdCleanup(client: PoolClient, publicId: string) {
  await client.query(
    `INSERT INTO cloudinary_cleanup (public_id)
     VALUES ($1)
     ON CONFLICT (public_id) DO NOTHING`,
    [publicId],
  );
}

async function enqueueUnresolvedUrlCleanup(client: PoolClient, mediaUrl: string) {
  await client.query(
    `INSERT INTO cloudinary_cleanup_unresolved (media_url)
     VALUES ($1)
     ON CONFLICT (media_url) DO NOTHING`,
    [mediaUrl],
  );
}

function invalidMediaReferenceError() {
  return Object.assign(new Error('An uploaded image is invalid or no longer belongs to this account.'), {
    code: 'INVALID_UPLOADED_MEDIA',
  });
}

async function lockPublicIds(client: PoolClient, publicIds: string[]) {
  for (const publicId of [...new Set(publicIds)].sort()) {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [publicId]);
  }
}

async function assertMediaCleanupNotPending(client: PoolClient, media: PostMediaInput[]) {
  const publicIds = [...new Set(media.flatMap((item) => (
    item.cloudinaryPublicId ? [item.cloudinaryPublicId] : []
  )))];
  const mediaUrls = [...new Set(media.map((item) => item.url))];
  if (!publicIds.length && !mediaUrls.length) return;
  const pending = await client.query(
    `SELECT 1
     WHERE EXISTS (
       SELECT 1 FROM cloudinary_cleanup WHERE public_id = ANY($1::text[])
     ) OR EXISTS (
       SELECT 1 FROM cloudinary_cleanup_unresolved WHERE media_url = ANY($2::text[])
     )
     LIMIT 1`,
    [publicIds, mediaUrls],
  );
  if (pending.rowCount) {
    throw Object.assign(new Error('An attached image is being permanently deleted.'), {
      code: 'MEDIA_CLEANUP_PENDING',
    });
  }
}
