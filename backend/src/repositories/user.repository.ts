import type { Pool } from 'pg';

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export interface UserAccount extends UserProfile {
  email: string;
  passwordHash: string;
}

export interface PublicProfile extends Omit<UserProfile, 'id'> {
  postCount: number;
}

export interface ProfileUpdates {
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface PublicPost {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  workType: string;
  sourcePostId: string | null;
  inspirationNote: string | null;
  authenticityDeclaration: string | null;
  verificationStatus: string;
  createdAt: Date;
  media: Array<{
    id: string;
    type: string;
    url: string;
    alt: string | null;
    aspect: string | null;
    position: number;
  }>;
}

export interface NewUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
}

interface UserProfileRow {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  created_at: Date;
}

interface UserAccountRow extends UserProfileRow {
  email: string;
  password_hash: string;
}

export interface UserRepository {
  create(user: NewUser): Promise<UserProfile>;
  findByLoginIdentifier(identifier: string): Promise<UserAccount | null>;
  findById(id: string): Promise<UserProfile | null>;
  findPublicProfile(username: string): Promise<PublicProfile | null>;
  updateProfile(id: string, updates: ProfileUpdates): Promise<UserProfile | null>;
  listPublicPosts(username: string, limit: number, offset: number): Promise<PublicPost[]>;
  countPublicPosts(username: string): Promise<number>;
}

export function createUserRepository(pool: Pick<Pool, 'query'>): UserRepository {
  return {
    async create(user) {
      const result = await pool.query<UserProfileRow>(
        `INSERT INTO users (
           id, username, email, password_hash, display_name, bio, avatar_url
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, username, display_name, bio, avatar_url, created_at`,
        [
          user.id,
          user.username,
          user.email,
          user.passwordHash,
          user.displayName,
          user.bio,
          user.avatarUrl,
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      };
    },
    async findByLoginIdentifier(identifier) {
      const result = await pool.query<UserAccountRow>(
        `SELECT id, username, email, password_hash, display_name, bio, avatar_url, created_at
         FROM users
         WHERE username = $1 OR email = $1
         LIMIT 1`,
        [identifier],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        email: row.email,
        passwordHash: row.password_hash,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      };
    },
    async findById(id) {
      const result = await pool.query<UserProfileRow>(
        `SELECT id, username, display_name, bio, avatar_url, created_at
         FROM users
         WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      };
    },
    async findPublicProfile(username) {
      const result = await pool.query<UserProfileRow & { post_count: string }>(
        `SELECT
           u.id, u.username, u.display_name, u.bio, u.avatar_url, u.created_at,
           COUNT(p.id)::text AS post_count
         FROM users u
         LEFT JOIN posts p ON p.user_id = u.id AND p.deleted_at IS NULL
         WHERE lower(u.username) = $1
         GROUP BY u.id`,
        [username],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
        postCount: Number(row.post_count),
      };
    },
    async updateProfile(id, updates) {
      const columns: string[] = [];
      const values: unknown[] = [id];
      if (updates.displayName !== undefined) {
        values.push(updates.displayName);
        columns.push(`display_name = $${values.length}`);
      }
      if (updates.bio !== undefined) {
        values.push(updates.bio);
        columns.push(`bio = $${values.length}`);
      }
      if (updates.avatarUrl !== undefined) {
        values.push(updates.avatarUrl);
        columns.push(`avatar_url = $${values.length}`);
      }

      const result = await pool.query<UserProfileRow>(
        `UPDATE users
         SET ${columns.join(', ')}, updated_at = now()
         WHERE id = $1
         RETURNING id, username, display_name, bio, avatar_url, created_at`,
        values,
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        avatarUrl: row.avatar_url,
        createdAt: row.created_at,
      };
    },
    async listPublicPosts(username, limit, offset) {
      const result = await pool.query<{
        id: string;
        title: string;
        description: string;
        category: string;
        tags: string[];
        work_type: string;
        source_post_id: string | null;
        inspiration_note: string | null;
        authenticity_declaration: string | null;
        verification_status: string;
        created_at: Date;
        media: PublicPost['media'];
      }>(
        `SELECT
           p.id, p.title, p.description, p.category, p.tags, p.work_type,
           p.source_post_id, p.inspiration_note, p.authenticity_declaration,
           p.verification_status, p.created_at,
           COALESCE(
             json_agg(json_build_object(
               'id', m.id,
               'type', m.media_type,
               'url', m.media_url,
               'alt', m.alt_text,
               'aspect', m.aspect,
               'position', m.position
             ) ORDER BY m.position) FILTER (WHERE m.id IS NOT NULL),
             '[]'::json
           ) AS media
         FROM posts p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN post_media m ON m.post_id = p.id
         WHERE lower(u.username) = $1 AND p.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $2 OFFSET $3`,
        [username, limit, offset],
      );

      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        tags: row.tags,
        workType: row.work_type,
        sourcePostId: row.source_post_id,
        inspirationNote: row.inspiration_note,
        authenticityDeclaration: row.authenticity_declaration,
        verificationStatus: row.verification_status,
        createdAt: row.created_at,
        media: row.media,
      }));
    },
    async countPublicPosts(username) {
      const result = await pool.query<{ post_count: string }>(
        `SELECT COUNT(p.id)::text AS post_count
         FROM users u
         LEFT JOIN posts p ON p.user_id = u.id AND p.deleted_at IS NULL
         WHERE lower(u.username) = $1
         GROUP BY u.id`,
        [username],
      );
      return Number(result.rows[0]?.post_count ?? 0);
    },
  };
}
