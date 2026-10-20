import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export interface FollowUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface FollowStats {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
}

export interface FollowList {
  users: FollowUser[];
  total: number;
}

export type FollowChange = 'changed' | 'unchanged' | 'not_found' | 'self';

export interface FollowRepository {
  change(followerId: string, username: string, follow: boolean): Promise<FollowChange>;
  getStats(username: string, viewerId: string | null): Promise<FollowStats | null>;
  listFollowers(username: string, limit: number, offset: number): Promise<FollowList | null>;
  listFollowing(username: string, limit: number, offset: number): Promise<FollowList | null>;
}

interface FollowUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

function mapUser(row: FollowUserRow): FollowUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

export function createFollowRepository(pool: Pick<Pool, 'query'>): FollowRepository {
  return {
    async change(followerId, username, follow) {
      const target = await pool.query<{ id: string }>(
        'SELECT id FROM users WHERE lower(username) = $1',
        [username],
      );
      const followedId = target.rows[0]?.id;
      if (!followedId) return 'not_found';
      if (followerId === followedId) return 'self';

      if (follow) {
        const result = await pool.query(
          `WITH inserted AS (
             INSERT INTO creator_follows (follower_id, followed_id)
             VALUES ($1, $2) ON CONFLICT (follower_id, followed_id) DO NOTHING
             RETURNING follower_id, followed_id
           ),
           notified AS (
             INSERT INTO notifications (id, recipient_id, actor_id, event_type)
             SELECT $3, followed_id, follower_id, 'follow'
             FROM inserted
             RETURNING id
           )
           SELECT followed_id FROM inserted`,
          [followerId, followedId, randomUUID()],
        );
        return result.rowCount ? 'changed' : 'unchanged';
      }

      const result = await pool.query(
        `DELETE FROM creator_follows
         WHERE follower_id = $1 AND followed_id = $2`,
        [followerId, followedId],
      );
      return result.rowCount ? 'changed' : 'unchanged';
    },
    async getStats(username, viewerId) {
      const result = await pool.query<{
        followers_count: string;
        following_count: string;
        is_following: boolean;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM creator_follows f WHERE f.followed_id = target.id)::text AS followers_count,
           (SELECT COUNT(*) FROM creator_follows f WHERE f.follower_id = target.id)::text AS following_count,
           CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
             SELECT 1 FROM creator_follows f
             WHERE f.follower_id = $2 AND f.followed_id = target.id
           ) END AS is_following
         FROM users target
         WHERE lower(target.username) = $1`,
        [username, viewerId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        followersCount: Number(row.followers_count),
        followingCount: Number(row.following_count),
        isFollowing: row.is_following,
      };
    },
    async listFollowers(username, limit, offset) {
      return listForUser(pool, username, 'followers', limit, offset);
    },
    async listFollowing(username, limit, offset) {
      return listForUser(pool, username, 'following', limit, offset);
    },
  };
}

async function listForUser(
  pool: Pick<Pool, 'query'>,
  username: string,
  direction: 'followers' | 'following',
  limit: number,
  offset: number,
): Promise<FollowList | null> {
  const base = direction === 'followers'
    ? 'creator_follows f JOIN users listed ON listed.id = f.follower_id'
    : 'creator_follows f JOIN users listed ON listed.id = f.followed_id';
  const ownership = direction === 'followers' ? 'f.followed_id' : 'f.follower_id';
  const [userResult, listResult, countResult] = await Promise.all([
    pool.query<{ id: string }>('SELECT id FROM users WHERE lower(username) = $1', [username]),
    pool.query<FollowUserRow>(
      `SELECT listed.id, listed.username, listed.display_name, listed.avatar_url
       FROM ${base}
       JOIN users target ON target.id = ${ownership}
       WHERE lower(target.username) = $1
       ORDER BY f.created_at DESC, listed.id
       LIMIT $2 OFFSET $3`,
      [username, limit, offset],
    ),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM ${base}
       JOIN users target ON target.id = ${ownership}
       WHERE lower(target.username) = $1`,
      [username],
    ),
  ]);
  if (!userResult.rows[0]) return null;
  return {
    users: listResult.rows.map(mapUser),
    total: Number(countResult.rows[0]?.total ?? 0),
  };
}
