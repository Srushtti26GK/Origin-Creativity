import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

export interface FollowUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowing?: boolean;
  followsYou?: boolean;
  isMutual?: boolean;
}

export interface FollowStats {
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsYou: boolean;
  isMutual: boolean;
  mutualFollowingCount: number;
}

export interface FollowList {
  users: FollowUser[];
  total: number;
}

export interface RecommendedCreator {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  mutualFollowersCount: number;
  sampleFollowers: string[];
  explanation: string;
}

export interface RecommendationList {
  creators: RecommendedCreator[];
  total: number;
}

export type FollowChange = 'changed' | 'unchanged' | 'not_found' | 'self';

export interface FollowRepository {
  change(followerId: string, username: string, follow: boolean): Promise<FollowChange>;
  getStats(username: string, viewerId: string | null): Promise<FollowStats | null>;
  listFollowers(username: string, limit: number, offset: number, viewerId?: string | null): Promise<FollowList | null>;
  listFollowing(username: string, limit: number, offset: number, viewerId?: string | null): Promise<FollowList | null>;
  getRecommendations(userId: string, limit: number, offset: number): Promise<RecommendationList>;
}

interface FollowUserRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_following?: boolean;
  follows_you?: boolean;
}

function mapUser(row: FollowUserRow): FollowUser {
  const isFollowing = Boolean(row.is_following);
  const followsYou = Boolean(row.follows_you);
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isFollowing,
    followsYou,
    isMutual: isFollowing && followsYou,
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
             WHERE NOT EXISTS (
               SELECT 1 FROM notifications n
               WHERE n.recipient_id = followed_id
                 AND n.actor_id = follower_id
                 AND n.event_type = 'follow'
                 AND n.read_at IS NULL
             )
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
        follows_you: boolean;
        mutual_following_count: string;
      }>(
        `SELECT
           (SELECT COUNT(*) FROM creator_follows f WHERE f.followed_id = target.id)::text AS followers_count,
           (SELECT COUNT(*) FROM creator_follows f WHERE f.follower_id = target.id)::text AS following_count,
           CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
             SELECT 1 FROM creator_follows f
             WHERE f.follower_id = $2 AND f.followed_id = target.id
           ) END AS is_following,
           CASE WHEN $2::uuid IS NULL THEN false ELSE EXISTS (
             SELECT 1 FROM creator_follows f
             WHERE f.follower_id = target.id AND f.followed_id = $2
           ) END AS follows_you,
           CASE WHEN $2::uuid IS NULL THEN '0' ELSE (
             SELECT COUNT(DISTINCT f1.followed_id)::text
             FROM creator_follows f1
             JOIN creator_follows f2 ON f2.followed_id = f1.followed_id
             WHERE f1.follower_id = $2 AND f2.follower_id = target.id AND f1.followed_id <> target.id AND f1.followed_id <> $2
           ) END AS mutual_following_count
         FROM users target
         WHERE lower(target.username) = $1`,
        [username, viewerId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const isFollowing = Boolean(row.is_following);
      const followsYou = Boolean(row.follows_you);
      return {
        followersCount: Number(row.followers_count),
        followingCount: Number(row.following_count),
        isFollowing,
        followsYou,
        isMutual: isFollowing && followsYou,
        mutualFollowingCount: Number(row.mutual_following_count || '0'),
      };
    },
    async listFollowers(username, limit, offset, viewerId = null) {
      return listForUser(pool, username, 'followers', limit, offset, viewerId);
    },
    async listFollowing(username, limit, offset, viewerId = null) {
      return listForUser(pool, username, 'following', limit, offset, viewerId);
    },
    async getRecommendations(userId, limit, offset) {
      const result = await pool.query<{
        id: string;
        username: string;
        display_name: string;
        bio: string | null;
        avatar_url: string | null;
        mutual_count: string;
        sample_followers: string[];
        total_count: string;
      }>(
        `WITH my_following AS (
           SELECT followed_id
           FROM creator_follows
           WHERE follower_id = $1
         ),
         candidates AS (
           SELECT
             cf.followed_id AS target_id,
             COUNT(DISTINCT cf.follower_id)::text AS mutual_count,
             ARRAY_AGG(DISTINCT u_follower.display_name ORDER BY u_follower.display_name) AS sample_followers
           FROM creator_follows cf
           JOIN my_following mf ON mf.followed_id = cf.follower_id
           JOIN users u_follower ON u_follower.id = cf.follower_id
           WHERE cf.followed_id <> $1
             AND cf.followed_id NOT IN (SELECT followed_id FROM my_following)
           GROUP BY cf.followed_id
         )
         SELECT
           u.id, u.username, u.display_name, u.bio, u.avatar_url,
           c.mutual_count,
           (c.sample_followers)[1:2] AS sample_followers,
           COUNT(*) OVER()::text AS total_count
         FROM candidates c
         JOIN users u ON u.id = c.target_id
         ORDER BY c.mutual_count::int DESC, u.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      const creators: RecommendedCreator[] = result.rows.map((row) => {
        const mutualCount = Number(row.mutual_count);
        const sample = Array.isArray(row.sample_followers) ? row.sample_followers.filter(Boolean) : [];
        let explanation = `Followed by ${mutualCount} ${mutualCount === 1 ? 'creator' : 'creators'} you follow`;
        if (sample.length === 1 && mutualCount === 1) {
          explanation = `Followed by ${sample[0]}`;
        } else if (sample.length >= 2 && mutualCount === 2) {
          explanation = `Followed by ${sample[0]} and ${sample[1]}`;
        } else if (sample.length >= 2 && mutualCount > 2) {
          explanation = `Followed by ${sample[0]}, ${sample[1]} and ${mutualCount - 2} more you follow`;
        }
        return {
          id: row.id,
          username: row.username,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          bio: row.bio,
          mutualFollowersCount: mutualCount,
          sampleFollowers: sample,
          explanation,
        };
      });

      return {
        creators,
        total: Number(result.rows[0]?.total_count ?? 0),
      };
    },
  };
}

async function listForUser(
  pool: Pick<Pool, 'query'>,
  username: string,
  direction: 'followers' | 'following',
  limit: number,
  offset: number,
  viewerId: string | null = null,
): Promise<FollowList | null> {
  const base = direction === 'followers'
    ? 'creator_follows f JOIN users listed ON listed.id = f.follower_id'
    : 'creator_follows f JOIN users listed ON listed.id = f.followed_id';
  const ownership = direction === 'followers' ? 'f.followed_id' : 'f.follower_id';
  const [userResult, listResult, countResult] = await Promise.all([
    pool.query<{ id: string }>('SELECT id FROM users WHERE lower(username) = $1', [username]),
    pool.query<FollowUserRow>(
      `SELECT listed.id, listed.username, listed.display_name, listed.avatar_url,
              CASE WHEN $4::uuid IS NULL THEN false ELSE EXISTS (
                SELECT 1 FROM creator_follows f1 WHERE f1.follower_id = $4 AND f1.followed_id = listed.id
              ) END AS is_following,
              CASE WHEN $4::uuid IS NULL THEN false ELSE EXISTS (
                SELECT 1 FROM creator_follows f2 WHERE f2.follower_id = listed.id AND f2.followed_id = $4
              ) END AS follows_you
       FROM ${base}
       JOIN users target ON target.id = ${ownership}
       WHERE lower(target.username) = $1
       ORDER BY f.created_at DESC, listed.id
       LIMIT $2 OFFSET $3`,
      [username, limit, offset, viewerId],
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
