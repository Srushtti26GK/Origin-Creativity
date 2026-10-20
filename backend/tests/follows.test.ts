import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type {
  FollowChange,
  FollowList,
  FollowRepository,
  FollowStats,
  FollowUser,
} from '../src/repositories/follow.repository.js';
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
process.env.FRONTEND_ORIGINS = 'http://follows.test';
process.env.SESSION_SECRET = 'follows-test-session-secret-value-at-least-32-bytes';
process.env.DB_USER = 'follows_test';
process.env.DB_PASSWORD = 'follows_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'follows_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://follows.test';
const userId = '123e4567-e89b-42d3-a456-426614174000';
const targetId = '123e4567-e89b-42d3-a456-426614174001';
const password = 'a-long-follow-test-password';
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

function createUsers(): UserRepository {
  const profiles = new Map<string, UserProfile>([
    [userId, {
      id: userId, username: 'follower_one', displayName: 'Follower One', bio: null,
      avatarUrl: null, createdAt: new Date('2026-01-01T00:00:00Z'),
    }],
    [targetId, {
      id: targetId, username: 'creator_two', displayName: 'Creator Two', bio: null,
      avatarUrl: 'https://example.test/avatar.png', createdAt: new Date('2026-01-02T00:00:00Z'),
    }],
  ]);
  const account: UserAccount = {
    ...profiles.get(userId)!,
    email: 'follower@example.test',
    passwordHash,
  };
  return {
    async create(_user: NewUser) { return profiles.get(userId)!; },
    async findByLoginIdentifier(identifier) {
      return identifier === 'follower_one' || identifier === account.email ? account : null;
    },
    async findById(id) { return profiles.get(id) ?? null; },
    async findPublicProfile(username): Promise<PublicProfile | null> {
      const found = [...profiles.values()].find((profile) => profile.username === username);
      return found ? {
        username: found.username,
        displayName: found.displayName,
        bio: found.bio,
        avatarUrl: found.avatarUrl,
        createdAt: found.createdAt,
        postCount: 0,
      } : null;
    },
    async updateProfile(_id: string, _updates: ProfileUpdates): Promise<UserProfile | null> { return null; },
    async listPublicPosts(_username: string, _limit: number, _offset: number): Promise<PublicPost[]> { return []; },
    async countPublicPosts(_username: string): Promise<number> { return 0; },
  };
}

function createFollows(): FollowRepository {
  const relationships = new Set<string>();
  const users: FollowUser[] = [
    { id: userId, username: 'follower_one', displayName: 'Follower One', avatarUrl: null },
    { id: targetId, username: 'creator_two', displayName: 'Creator Two', avatarUrl: 'https://example.test/avatar.png' },
  ];
  function statsFor(target: FollowUser, viewerId: string | null): FollowStats {
    return {
      followersCount: [...relationships].filter((item) => item.endsWith(`:${target.id}`)).length,
      followingCount: [...relationships].filter((item) => item.startsWith(`${target.id}:`)).length,
      isFollowing: viewerId ? relationships.has(`${viewerId}:${target.id}`) : false,
    };
  }
  function listFor(username: string, direction: 'followers' | 'following', limit: number, offset: number): FollowList | null {
    const target = users.find((item) => item.username === username);
    if (!target) return null;
    const relatedIds = [...relationships].flatMap((relationship) => {
      const [follower, followed] = relationship.split(':');
      if (direction === 'followers' && followed === target.id) return [follower];
      if (direction === 'following' && follower === target.id) return [followed];
      return [];
    });
    const relatedUsers = relatedIds.map((id) => users.find((item) => item.id === id)!).filter(Boolean);
    return { users: relatedUsers.slice(offset, offset + limit), total: relatedUsers.length };
  }
  return {
    async change(followerId, username, shouldFollow): Promise<FollowChange> {
      const target = users.find((item) => item.username === username);
      if (!target) return 'not_found';
      if (target.id === followerId) return 'self';
      const key = `${followerId}:${target.id}`;
      const existed = relationships.has(key);
      if (shouldFollow) relationships.add(key);
      else relationships.delete(key);
      return existed === shouldFollow ? 'unchanged' : 'changed';
    },
    async getStats(username, viewerId) {
      const target = users.find((item) => item.username === username);
      return target ? statsFor(target, viewerId) : null;
    },
    async listFollowers(username, limit, offset) { return listFor(username, 'followers', limit, offset); },
    async listFollowing(username, limit, offset) { return listFor(username, 'following', limit, offset); },
  };
}

async function startApp() {
  const session = await import('express-session').then(({ default: expressSession }) =>
    new expressSession.MemoryStore());
  const server = createServer(createApp({
    users: createUsers(),
    follows: createFollows(),
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

async function authenticate(baseUrl: string) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
  const initialCookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(initialCookie);
  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', origin, cookie: initialCookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ identifier: 'follower_one', password }),
  });
  assert.equal(loginResponse.status, 200);
  const loggedIn = await loginResponse.json() as { csrfToken: string };
  const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrfToken: loggedIn.csrfToken };
}

test('follow and unfollow are authenticated, idempotent, and update status and counts', async () => {
  const app = await startApp();
  try {
    const auth = await authenticate(app.baseUrl);
    const headers = { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken };
    const follow = await fetch(`${app.baseUrl}/api/users/creator_two/follow`, { method: 'POST', headers });
    assert.equal(follow.status, 200);
    assert.deepEqual(await follow.json(), {
      status: 'ok', isFollowing: true, followersCount: 1, followingCount: 0,
    });

    const duplicate = await fetch(`${app.baseUrl}/api/users/creator_two/follow`, { method: 'POST', headers });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json() as { followersCount: number }).followersCount, 1);

    const status = await fetch(`${app.baseUrl}/api/users/creator_two/follow-status`, {
      headers: { cookie: auth.cookie },
    });
    assert.deepEqual(await status.json(), {
      status: 'ok', followersCount: 1, followingCount: 0, isFollowing: true,
    });

    const unfollow = await fetch(`${app.baseUrl}/api/users/creator_two/follow`, {
      method: 'DELETE', headers,
    });
    assert.equal(unfollow.status, 200);
    assert.equal((await unfollow.json() as { followersCount: number }).followersCount, 0);
    const repeated = await fetch(`${app.baseUrl}/api/users/creator_two/follow`, {
      method: 'DELETE', headers,
    });
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json() as { isFollowing: boolean }).isFollowing, false);
  } finally {
    await app.close();
  }
});

test('follow operations reject unauthenticated, CSRF-invalid, and self-follow requests', async () => {
  const app = await startApp();
  try {
    const unauthenticated = await fetch(`${app.baseUrl}/api/users/creator_two/follow`, {
      method: 'POST', headers: { origin },
    });
    assert.equal(unauthenticated.status, 401);

    const auth = await authenticate(app.baseUrl);
    const badCsrf = await fetch(`${app.baseUrl}/api/users/creator_two/follow`, {
      method: 'POST',
      headers: { origin, cookie: auth.cookie, 'x-csrf-token': 'invalid' },
    });
    assert.equal(badCsrf.status, 403);

    const selfFollow = await fetch(`${app.baseUrl}/api/users/follower_one/follow`, {
      method: 'POST',
      headers: { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken },
    });
    assert.equal(selfFollow.status, 400);
  } finally {
    await app.close();
  }
});

test('follower and following lists return paginated safe profile fields', async () => {
  const app = await startApp();
  try {
    const auth = await authenticate(app.baseUrl);
    await fetch(`${app.baseUrl}/api/users/creator_two/follow`, {
      method: 'POST',
      headers: { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken },
    });
    const response = await fetch(`${app.baseUrl}/api/users/creator_two/followers?page=1&limit=1`);
    const result = await response.json() as {
      users: FollowUser[];
      pagination: { page: number; total: number; totalPages: number };
    };
    assert.equal(response.status, 200);
    assert.deepEqual(result.users, [{
      id: userId,
      username: 'follower_one',
      displayName: 'Follower One',
      avatarUrl: null,
    }]);
    assert.deepEqual(result.pagination, { page: 1, pageSize: 1, total: 1, totalPages: 1 });

    const following = await fetch(`${app.baseUrl}/api/users/follower_one/following`);
    assert.equal((await following.json() as { users: FollowUser[] }).users[0].username, 'creator_two');
  } finally {
    await app.close();
  }
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
