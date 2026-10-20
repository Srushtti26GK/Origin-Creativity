import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
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
process.env.FRONTEND_ORIGINS = 'http://profile.test';
process.env.SESSION_SECRET = 'profile-test-session-secret-at-least-32-bytes';
process.env.DB_USER = 'profile_test';
process.env.DB_PASSWORD = 'profile_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'profile_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://profile.test';
const passwordHash = await argon2.hash('profile-test-password', { type: argon2.argon2id });

function createUsers(): UserRepository {
  const profile: UserProfile = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    username: 'maker_one',
    displayName: 'Maker One',
    bio: 'Profile bio',
    avatarUrl: 'https://example.test/avatar.png',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const account: UserAccount = {
    ...profile,
    email: 'maker@example.test',
    passwordHash,
  };
  const publicProfile: PublicProfile = {
    username: profile.username,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    createdAt: profile.createdAt,
    postCount: 3,
  };
  const posts: PublicPost[] = [1, 2, 3].map((id) => ({
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    title: `Post ${id}`,
    description: 'A public post description long enough for the schema.',
    category: 'painting',
    tags: [],
    workType: 'original',
    sourcePostId: null,
    inspirationNote: null,
    authenticityDeclaration: 'original',
    verificationStatus: 'unverified',
    createdAt: new Date(`2026-01-0${id}T00:00:00.000Z`),
    media: [],
  }));
  let updates: ProfileUpdates | undefined;
  let listArguments: { username: string; limit: number; offset: number } | undefined;

  const repository: UserRepository & {
    getUpdates: () => ProfileUpdates | undefined;
    getListArguments: () => typeof listArguments;
  } = {
    async create(user: NewUser) {
      return { ...profile, id: user.id, username: user.username };
    },
    async findByLoginIdentifier(identifier) {
      return identifier === account.username || identifier === account.email ? account : null;
    },
    async findById(id) {
      return id === profile.id ? profile : null;
    },
    async findPublicProfile(username) {
      return username === publicProfile.username ? publicProfile : null;
    },
    async updateProfile(id, changes) {
      if (id !== profile.id) return null;
      updates = changes;
      return { ...profile, ...changes };
    },
    async listPublicPosts(username, limit, offset) {
      listArguments = { username, limit, offset };
      return username === profile.username ? posts.slice(offset, offset + limit) : [];
    },
    async countPublicPosts(username) {
      return username === profile.username ? posts.length : 0;
    },
    getUpdates: () => updates,
    getListArguments: () => listArguments,
  };
  return repository;
}

async function startApp(users: UserRepository) {
  const session = await import('express-session').then(({ default: expressSession }) =>
    new expressSession.MemoryStore());
  const server = createServer(createApp({ users, sessionStore: session }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function authenticate(baseUrl: string) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
  const cookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ identifier: 'maker_one', password: 'profile-test-password' }),
  });
  assert.equal(response.status, 200);
  const { csrfToken: authenticatedCsrf } = await response.json() as { csrfToken: string };
  const authenticatedCookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(authenticatedCookie);
  return { cookie: authenticatedCookie, csrfToken: authenticatedCsrf };
}

test('public profile returns safe profile fields and active post count only', async () => {
  const users = createUsers();
  const app = await startApp(users);

  try {
    const response = await fetch(`${app.baseUrl}/api/users/MAKER_ONE`);
    const result = await response.json() as { user: Record<string, unknown> };

    assert.equal(response.status, 200);
    assert.deepEqual(result.user, {
      username: 'maker_one',
      displayName: 'Maker One',
      bio: 'Profile bio',
      avatarUrl: 'https://example.test/avatar.png',
      createdAt: '2026-01-01T00:00:00.000Z',
      postCount: 3,
    });
    assert.equal('email' in result.user, false);
    assert.equal('passwordHash' in result.user, false);
  } finally {
    await app.close();
  }
});

test('profile update requires login and valid CSRF token, and only updates own editable fields', async () => {
  const users = createUsers();
  const app = await startApp(users);

  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const cookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);

    const unauthenticated = await fetch(`${app.baseUrl}/api/users/me`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({ displayName: 'Changed Name' }),
    });
    assert.equal(unauthenticated.status, 401);

    const auth = await authenticate(app.baseUrl);
    const update = await fetch(`${app.baseUrl}/api/users/me`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie: auth.cookie,
        'x-csrf-token': auth.csrfToken,
      },
      body: JSON.stringify({
        displayName: ' Updated Name ',
        bio: 'New bio',
        avatarUrl: 'https://example.test/new-avatar.png',
      }),
    });
    const updated = await update.json() as { user: UserProfile };

    assert.equal(update.status, 200);
    assert.equal(updated.user.displayName, 'Updated Name');
    assert.deepEqual(users.getUpdates?.(), {
      displayName: 'Updated Name',
      bio: 'New bio',
      avatarUrl: 'https://example.test/new-avatar.png',
    });
  } finally {
    await app.close();
  }
});

test('profile update rejects invalid fields, malformed avatar references, and missing CSRF', async () => {
  const users = createUsers();
  const app = await startApp(users);

  try {
    const auth = await authenticate(app.baseUrl);
    for (const body of [
      { displayName: '   ' },
      { bio: 'x'.repeat(501) },
      { avatarUrl: 'javascript:alert(1)' },
      { username: 'other_user' },
      {},
    ]) {
      const response = await fetch(`${app.baseUrl}/api/users/me`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin,
          cookie: auth.cookie,
          'x-csrf-token': auth.csrfToken,
        },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }

    const missingCsrf = await fetch(`${app.baseUrl}/api/users/me`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie: auth.cookie,
      },
      body: JSON.stringify({ displayName: 'Changed Name' }),
    });
    assert.equal(missingCsrf.status, 403);
  } finally {
    await app.close();
  }
});

test('public posts paginate and report totals, excluding deleted rows in repository query', async () => {
  const users = createUsers();
  const app = await startApp(users);

  try {
    const response = await fetch(`${app.baseUrl}/api/users/maker_one/posts?page=2&limit=2`);
    const result = await response.json() as {
      posts: PublicPost[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };

    assert.equal(response.status, 200);
    assert.equal(result.posts.length, 1);
    assert.deepEqual(result.pagination, { page: 2, pageSize: 2, total: 3, totalPages: 2 });
    assert.deepEqual(users.getListArguments?.(), {
      username: 'maker_one',
      limit: 2,
      offset: 2,
    });
  } finally {
    await app.close();
  }
});

test('invalid pagination and unknown usernames return client/not-found responses', async () => {
  const app = await startApp(createUsers());

  try {
    const invalid = await fetch(`${app.baseUrl}/api/users/maker_one/posts?page=0&limit=100`);
    assert.equal(invalid.status, 400);
    const unsafeOffset = await fetch(`${app.baseUrl}/api/users/maker_one/posts?page=9007199254740991&limit=50`);
    assert.equal(unsafeOffset.status, 400);
    const missing = await fetch(`${app.baseUrl}/api/users/no_such_user`);
    assert.equal(missing.status, 404);
    const badUsername = await fetch(`${app.baseUrl}/api/users/not%20valid`);
    assert.equal(badUsername.status, 400);
  } finally {
    await app.close();
  }
});

test('profile repository binds the requested profile identifier and excludes deleted posts', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const { createUserRepository } = await import('../src/repositories/user.repository.js');
  const repository = createUserRepository({
    async query(sql, values) {
      calls.push({ sql, values: values as unknown[] });
      return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] };
    },
  });

  await repository.findPublicProfile('maker_one');
  await repository.listPublicPosts('maker_one', 12, 0);
  await repository.updateProfile('user-id', { displayName: 'Updated' });

  assert.equal(calls.every((call) => call.values.includes('maker_one') || call.values.includes('user-id')), true);
  assert.ok(calls[1].sql.includes('p.deleted_at IS NULL'));
  assert.ok(calls[0].sql.includes('p.deleted_at IS NULL'));
  assert.ok(calls[1].sql.includes('LIMIT $2 OFFSET $3'));
  assert.ok(calls[2].sql.includes('display_name = $2'));
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
