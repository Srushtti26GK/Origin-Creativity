import type { Pool } from 'pg';

export type NotificationEventType = 'like' | 'comment' | 'follow';

export interface NotificationRecord {
  id: string;
  eventType: NotificationEventType;
  createdAt: Date;
  readAt: Date | null;
  actor: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  post: { id: string; title: string } | null;
}

export interface NotificationPage {
  notifications: NotificationRecord[];
  total: number;
  unreadCount: number;
}

export interface NotificationRepository {
  list(recipientId: string, limit: number, offset: number): Promise<NotificationPage>;
  markRead(notificationId: string, recipientId: string): Promise<boolean>;
  markAllRead(recipientId: string): Promise<number>;
}

interface NotificationRow {
  id: string;
  event_type: NotificationEventType;
  created_at: Date;
  read_at: Date | null;
  actor_id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  post_id: string | null;
  post_title: string | null;
  total: string;
  unread_count: string;
}

function mapNotification(row: NotificationRow): NotificationRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    createdAt: row.created_at,
    readAt: row.read_at,
    actor: {
      id: row.actor_id,
      username: row.actor_username,
      displayName: row.actor_display_name,
      avatarUrl: row.actor_avatar_url,
    },
    post: row.post_id && row.post_title ? { id: row.post_id, title: row.post_title } : null,
  };
}

export function createNotificationRepository(pool: Pick<Pool, 'query'>): NotificationRepository {
  return {
    async list(recipientId, limit, offset) {
      const [items, counts] = await Promise.all([
        pool.query<NotificationRow>(
          `SELECT n.id, n.event_type, n.created_at, n.read_at,
                  actor.id AS actor_id, actor.username AS actor_username,
                  actor.display_name AS actor_display_name, actor.avatar_url AS actor_avatar_url,
                  p.id AS post_id, p.title AS post_title
           FROM notifications n
           JOIN users actor ON actor.id = n.actor_id
           LEFT JOIN posts p ON p.id = n.post_id AND p.deleted_at IS NULL
           WHERE n.recipient_id = $1
           ORDER BY n.created_at DESC, n.id DESC
           LIMIT $2 OFFSET $3`,
          [recipientId, limit, offset],
        ),
        pool.query<{ total: string; unread_count: string }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE read_at IS NULL)::text AS unread_count
           FROM notifications
           WHERE recipient_id = $1`,
          [recipientId],
        ),
      ]);
      return {
        notifications: items.rows.map(mapNotification),
        total: Number(counts.rows[0]?.total ?? 0),
        unreadCount: Number(counts.rows[0]?.unread_count ?? 0),
      };
    },
    async markRead(notificationId, recipientId) {
      const result = await pool.query(
        `UPDATE notifications
         SET read_at = COALESCE(read_at, now())
         WHERE id = $1 AND recipient_id = $2
         RETURNING id`,
        [notificationId, recipientId],
      );
      return (result.rowCount ?? 0) > 0;
    },
    async markAllRead(recipientId) {
      const result = await pool.query(
        `UPDATE notifications SET read_at = now()
         WHERE recipient_id = $1 AND read_at IS NULL`,
        [recipientId],
      );
      return result.rowCount ?? 0;
    },
  };
}
