import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type {
  NotificationRecord,
  NotificationRepository,
} from '../src/repositories/notification.repository.js';
import type {
  NewUser,
  ProfileUpdates,
  PublicPost,
  PublicProfile,
  UserAccount,
  UserProfile,
  UserRepository,
} from '../src/repositories/user.repository.js';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://notifications.test';
process.env.SESSION_SECRET = 'notifications-test-session-secret-value-at-least-32-bytes';
process.env.DB_USER = 'notifications_test';
process.env.DB_PASSWORD = 'notifications_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'notifications_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://notifications.test';
const ownerId = '123e4567-e89b-42d3-a456-426614174000';
const otherId = '123e4567-e89b-42d3-a456-426614174001';
const ownNotificationId = '323e4567-e89b-42d3-a456-426614174000';
const otherNotificationId = '323e4567-e89b-42d3-a456-426614174001';
const secondOwnNotificationId = '323e4567-e89b-42d3-a456-426614174002';
const password = 'a-long-notification-test-password';
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

function createUsers(): UserRepository {
  const profiles: UserProfile[] = [
    {
      id: ownerId, username: 'notify_owner', displayName: 'Notify Owner',
      bio: null, avatarUrl: null, createdAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: otherId, username: 'other_actor', displayName: 'Other Actor',
      bio: null, avatarUrl: null, createdAt: new Date('2026-01-02T00:00:00Z'),
    },
  ];
  const accounts: UserAccount[] = profiles.map((profile) => ({
    ...profile, email: `${profile.username}@example.test`, passwordHash,
  }));
  return {
    async create(_user: NewUser) { return profiles[0]; },
    async findByLoginIdentifier(identifier) {
      return accounts.find((account) => account.username === identifier) ?? null;
    },
    async findById(id) { return profiles.find((profile) => profile.id === id) ?? null; },
    async findPublicProfile(_username): Promise<PublicProfile | null> { return null; },
    async updateProfile(_id: string, _updates: ProfileUpdates): Promise<UserProfile | null> { return null; },
    async listPublicPosts(_username: string, _limit: number, _offset: number): Promise<PublicPost[]> { return []; },
    async countPublicPosts(_username: string): Promise<number> { return 0; },
  };
}

function notification(id: string, recipientId: string, actorId: string): NotificationRecord {
  return {
    id,
    eventType: 'like',
    createdAt: new Date('2026-10-20T00:00:00Z'),
    readAt: null,
    actor: {
      id: actorId,
      username: actorId === otherId ? 'other_actor' : 'notify_owner',
      displayName: actorId === otherId ? 'Other Actor' : 'Notify Owner',
      avatarUrl: null,
    },
    post: { id: '223e4567-e89b-42d3-a456-426614174000', title: 'A creative work' },
  };
}

function createNotifications(): NotificationRepository {
  const records = [
    notification(ownNotificationId, ownerId, otherId),
    notification(otherNotificationId, otherId, ownerId),
    notification(secondOwnNotificationId, ownerId, otherId),
  ];
  const recipients = new Map([
    [ownNotificationId, ownerId],
    [otherNotificationId, otherId],
    [secondOwnNotificationId, ownerId],
  ]);
  return {
    async list(recipientId, limit, offset) {
      const owned = records.filter((item) => recipients.get(item.id) === recipientId);
      return {
        notifications: owned.slice(offset, offset + limit),
        total: owned.length,
        unreadCount: owned.filter((item) => !item.readAt).length,
      };
    },
    async markRead(id, recipientId) {
      const item = records.find((record) => record.id === id && recipients.get(record.id) === recipientId);
      if (!item) return false;
      item.readAt ??= new Date();
      return true;
    },
    async markAllRead(recipientId) {
      const owned = records.filter((item) => recipients.get(item.id) === recipientId);
      let count = 0;
      for (const item of owned) {
        if (!item.readAt) {
          item.readAt = new Date();
          count += 1;
        }
      }
      return count;
    },
  };
}

async function startApp() {
  const session = await import('express-session').then(({ default: expressSession }) => new expressSession.MemoryStore());
  const server = createServer(createApp({
    users: createUsers(),
    notifications: createNotifications(),
    sessionStore: session,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function authenticate(baseUrl: string, username = 'notify_owner') {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
  const initialCookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(initialCookie);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      origin, cookie: initialCookie, 'content-type': 'application/json', 'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ identifier: username, password }),
  });
  assert.equal(login.status, 200);
  const responseBody = await login.json() as { csrfToken: string };
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrfToken: responseBody.csrfToken };
}

test('notification reads and updates are authenticated, recipient-scoped, and persistent', async () => {
  const app = await startApp();
  try {
    assert.equal((await fetch(`${app.baseUrl}/api/notifications`)).status, 401);
    const auth = await authenticate(app.baseUrl);
    const headers = { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken };

    const listed = await fetch(`${app.baseUrl}/api/notifications`, { headers });
    assert.equal(listed.status, 200);
    const page = await listed.json() as {
      notifications: NotificationRecord[];
      unreadCount: number;
      pagination: { total: number };
    };
    assert.equal(page.pagination.total, 2);
    assert.equal(page.unreadCount, 2);
    assert.deepEqual(page.notifications.map((item) => item.id), [ownNotificationId, secondOwnNotificationId]);
    assert.equal(page.notifications[0].actor.username, 'other_actor');

    const missingCsrf = await fetch(`${app.baseUrl}/api/notifications/${ownNotificationId}/read`, {
      method: 'PATCH', headers: { origin, cookie: auth.cookie },
    });
    assert.equal(missingCsrf.status, 403);
    const forbidden = await fetch(`${app.baseUrl}/api/notifications/${otherNotificationId}/read`, {
      method: 'PATCH', headers,
    });
    assert.equal(forbidden.status, 404);

    const marked = await fetch(`${app.baseUrl}/api/notifications/${ownNotificationId}/read`, {
      method: 'PATCH', headers,
    });
    assert.equal(marked.status, 200);
    const refreshed = await fetch(`${app.baseUrl}/api/notifications`, { headers });
    const refreshedPage = await refreshed.json() as typeof page;
    assert.equal(refreshedPage.unreadCount, 1);
    assert.ok(refreshedPage.notifications[0].readAt);

    const markAll = await fetch(`${app.baseUrl}/api/notifications/read-all`, {
      method: 'PATCH', headers,
    });
    assert.deepEqual(await markAll.json(), { status: 'ok', updatedCount: 1, unreadCount: 0 });
  } finally {
    await app.close();
  }
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
