import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface PostSocialStats {
  postId: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  recentComments?: SocialComment[];
}

export interface SocialComment {
  id: string;
  postId: string;
  userId: string;
  text: string;
  createdAt: Date | string;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export type InteractionResult = 'changed' | 'unchanged' | 'not_found';

export interface RepostChange {
  result: InteractionResult;
  repostId?: string;
}

export interface RepostActivity {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface SocialRepository {
  getPostStats(postIds: string[], viewerId: string | null): Promise<Map<string, PostSocialStats>>;
  changeLike(postId: string, userId: string, liked: boolean): Promise<InteractionResult>;
  listComments(postId: string): Promise<{ comments: SocialComment[]; total: number } | null>;
  createComment(postId: string, userId: string, text: string): Promise<SocialComment | null>;
  deleteComment(commentId: string, userId: string, postId: string): Promise<string | null>;
  changeRepost(postId: string, userId: string, reposted: boolean): Promise<RepostChange>;
  getRepostActivity(repostId: string): Promise<RepostActivity | null>;
}

interface SocialStatsRow {
  post_id: string;
  likes_count: string;
  comments_count: string;
  reposts_count: string;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  recent_comments: SocialComment[];
}

interface CommentRow {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: Date;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

function mapComment(row: CommentRow): SocialComment {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id,
    text: row.content,
    createdAt: row.created_at,
    author: {
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };
}

export function createSocialRepository(pool: Pick<Pool, 'query'>): SocialRepository {
  return {
    async getPostStats(postIds, viewerId) {
      if (postIds.length === 0) return new Map();
      const result = await pool.query<SocialStatsRow>(
        `SELECT
           p.id AS post_id,
           (SELECT COUNT(*)::text FROM likes l WHERE l.post_id = p.id) AS likes_count,
           (SELECT COUNT(*)::text FROM comments c WHERE c.post_id = p.id) AS comments_count,
           (SELECT COUNT(*)::text FROM reposts r WHERE r.post_id = p.id) AS reposts_count,
           CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
             SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $2
           ) END AS liked_by_me,
           CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
             SELECT 1 FROM reposts r WHERE r.post_id = p.id AND r.user_id = $2
           ) END AS reposted_by_me,
           COALESCE((
             SELECT json_agg(preview.comment ORDER BY preview.created_at ASC)
             FROM (
               SELECT json_build_object(
                 'id', c.id,
                 'postId', c.post_id,
                 'userId', c.user_id,
                 'text', c.content,
                 'createdAt', c.created_at,
                 'author', json_build_object(
                   'username', u.username,
                   'displayName', u.display_name,
                   'avatarUrl', u.avatar_url
                 )
               ) AS comment, c.created_at
               FROM comments c
               JOIN users u ON u.id = c.user_id
               WHERE c.post_id = p.id
               ORDER BY c.created_at DESC, c.id DESC
               LIMIT 2
             ) preview
           ), '[]'::json) AS recent_comments
         FROM posts p
         WHERE p.id = ANY($1::uuid[]) AND p.deleted_at IS NULL`,
        [postIds, viewerId],
      );
      return new Map(result.rows.map((row) => [row.post_id, {
        postId: row.post_id,
        likesCount: Number(row.likes_count),
        commentsCount: Number(row.comments_count),
        repostsCount: Number(row.reposts_count),
        likedByMe: row.liked_by_me,
        repostedByMe: row.reposted_by_me,
        recentComments: row.recent_comments,
      }]));
    },
    async changeLike(postId, userId, liked) {
      if (liked) {
        const inserted = await pool.query(
          `WITH inserted AS (
             INSERT INTO likes (user_id, post_id)
             SELECT $2, p.id FROM posts p
             WHERE p.id = $1 AND p.deleted_at IS NULL
             FOR SHARE OF p
             ON CONFLICT (user_id, post_id) DO NOTHING
             RETURNING user_id, post_id
           ),
           notified AS (
             INSERT INTO notifications (id, recipient_id, actor_id, event_type, post_id)
             SELECT $3, p.user_id, i.user_id, 'like', i.post_id
             FROM inserted i JOIN posts p ON p.id = i.post_id
             WHERE p.user_id <> i.user_id
               AND NOT EXISTS (
                 SELECT 1 FROM notifications n
                 WHERE n.recipient_id = p.user_id
                   AND n.actor_id = i.user_id
                   AND n.event_type = 'like'
                   AND n.post_id = i.post_id
                   AND n.read_at IS NULL
               )
             RETURNING id
           )
           SELECT post_id FROM inserted`,
          [postId, userId, randomUUID()],
        );
        if (inserted.rowCount) return 'changed';
        const exists = await activePostExists(pool, postId);
        if (!exists) return 'not_found';
        const alreadyLiked = await pool.query(
          'SELECT 1 FROM likes WHERE user_id = $1 AND post_id = $2',
          [userId, postId],
        );
        return alreadyLiked.rowCount ? 'unchanged' : 'not_found';
      }
      const deleted = await pool.query(
        `DELETE FROM likes l
         USING posts p
         WHERE l.user_id = $1 AND l.post_id = $2
           AND p.id = l.post_id AND p.deleted_at IS NULL
         RETURNING l.post_id`,
        [userId, postId],
      );
      if (deleted.rowCount) return 'changed';
      return await activePostExists(pool, postId) ? 'unchanged' : 'not_found';
    },
    async listComments(postId) {
      const [post, comments, count] = await Promise.all([
        pool.query('SELECT id FROM posts WHERE id = $1 AND deleted_at IS NULL', [postId]),
        pool.query<CommentRow>(
          `SELECT c.id, c.post_id, c.user_id, c.content, c.created_at,
                  u.username, u.display_name, u.avatar_url
           FROM comments c
           JOIN users u ON u.id = c.user_id
           WHERE c.post_id = $1
           ORDER BY c.created_at ASC, c.id ASC`,
          [postId],
        ),
        pool.query<{ total: string }>(
          'SELECT COUNT(*)::text AS total FROM comments WHERE post_id = $1',
          [postId],
        ),
      ]);
      if (!post.rowCount) return null;
      return {
        comments: comments.rows.map(mapComment),
        total: Number(count.rows[0]?.total ?? 0),
      };
    },
    async createComment(postId, userId, text) {
      const result = await pool.query<CommentRow>(
        `WITH inserted AS (
           INSERT INTO comments (id, user_id, post_id, content)
           SELECT $1, $2, p.id, $4
           FROM posts p
           WHERE p.id = $3 AND p.deleted_at IS NULL
           FOR SHARE OF p
           RETURNING id, post_id, user_id, content, created_at
         ),
         notified AS (
           INSERT INTO notifications (id, recipient_id, actor_id, event_type, post_id)
           SELECT $5, p.user_id, i.user_id, 'comment', i.post_id
           FROM inserted i JOIN posts p ON p.id = i.post_id
           WHERE p.user_id <> i.user_id
           RETURNING id
         )
         SELECT i.id, i.post_id, i.user_id, i.content, i.created_at,
                u.username, u.display_name, u.avatar_url
         FROM inserted i
         JOIN users u ON u.id = i.user_id`,
        [randomUUID(), userId, postId, text, randomUUID()],
      );
      return result.rows[0] ? mapComment(result.rows[0]) : null;
    },
    async deleteComment(commentId, userId, postId) {
      const result = await pool.query(
        `DELETE FROM comments c
         USING posts p
         WHERE c.id = $1 AND c.user_id = $2 AND c.post_id = $3
           AND p.id = c.post_id AND p.deleted_at IS NULL
         RETURNING c.post_id`,
        [commentId, userId, postId],
      );
      return result.rows[0]?.post_id ?? null;
    },
    async changeRepost(postId, userId, reposted) {
      if (reposted) {
        const inserted = await pool.query(
          `INSERT INTO reposts (id, user_id, post_id)
           SELECT $1, $2, p.id FROM posts p
           WHERE p.id = $3 AND p.deleted_at IS NULL
           FOR SHARE OF p
           ON CONFLICT (user_id, post_id) DO NOTHING
           RETURNING id`,
          [randomUUID(), userId, postId],
        );
        if (inserted.rows[0]) return { result: 'changed', repostId: inserted.rows[0].id };
        if (!(await activePostExists(pool, postId))) return { result: 'not_found' };
        const existing = await pool.query<{ id: string }>(
          'SELECT id FROM reposts WHERE user_id = $1 AND post_id = $2',
          [userId, postId],
        );
        return existing.rows[0]
          ? { result: 'unchanged', repostId: existing.rows[0].id }
          : { result: 'not_found' };
      }
      const deleted = await pool.query(
        'DELETE FROM reposts WHERE user_id = $1 AND post_id = $2 RETURNING id',
        [userId, postId],
      );
      if (deleted.rows[0]) return { result: 'changed', repostId: deleted.rows[0].id };
      return await activePostExists(pool, postId)
        ? { result: 'unchanged' }
        : { result: 'not_found' };
    },
    async getRepostActivity(repostId) {
      const result = await pool.query<{
        id: string;
        user_id: string;
        username: string;
        display_name: string;
        avatar_url: string | null;
        created_at: Date;
      }>(
        `SELECT r.id, r.user_id, u.username, u.display_name, u.avatar_url, r.created_at
         FROM reposts r
         JOIN users u ON u.id = r.user_id
         JOIN posts p ON p.id = r.post_id AND p.deleted_at IS NULL
         WHERE r.id = $1`,
        [repostId],
      );
      const row = result.rows[0];
      return row ? {
        id: row.id,
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      } : null;
    },
  };
}

async function activePostExists(pool: Pick<Pool, 'query'>, postId: string) {
  const result = await pool.query(
    'SELECT 1 FROM posts WHERE id = $1 AND deleted_at IS NULL',
    [postId],
  );
  return Boolean(result.rowCount);
}
