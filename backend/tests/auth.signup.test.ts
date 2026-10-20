import assert from 'node:assert/strict';
import argon2 from 'argon2';
import express from 'express';
import session from 'express-session';
import { createServer } from 'node:http';
import { test } from 'node:test';
import type { NewUser, UserProfile, UserRepository } from '../src/repositories/user.repository.js';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://frontend.test';
process.env.SESSION_SECRET = 'auth-test-secret-value-at-least-32-bytes';
process.env.DB_USER = 'auth_test';
process.env.DB_PASSWORD = 'auth_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'auth_test';

const [{ createAuthRouter }, { createUserRepository }] = await Promise.all([
  import('../src/routes/auth.routes.js'),
  import('../src/repositories/user.repository.js'),
]);

const validSignup = {
  username: 'Maker_One',
  email: 'MAKER@example.com ',
  password: 'a-long-test-password',
  displayName: 'Maker One',
  bio: 'A short bio.',
  avatarUrl: 'https://example.com/avatar.png',
};

const testOrigin = 'http://frontend.test';

function createTestServer(users: UserRepository) {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'auth-test-secret-value-at-least-32-bytes',
    store: new session.MemoryStore(),
    resave: false,
    saveUninitialized: false,
  }));
  app.use('/api/auth', createAuthRouter(users, [testOrigin]));
  return createServer(app);
}

async function postWithCsrf(
  port: number,
  path: string,
  body: unknown,
): Promise<Response> {
  const csrfResponse = await fetch(`http://127.0.0.1:${port}/api/auth/csrf`);
  const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
  const cookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);

  return fetch(`http://127.0.0.1:${port}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: testOrigin,
      cookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify(body),
  });
}

test('signup normalizes identity, hashes password with Argon2id, and returns only safe profile fields', async () => {
  let storedUser: NewUser | undefined;
  const appServer = createTestServer({
    async create(user) {
      storedUser = user;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
    },
  });
  await new Promise<void>((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const address = appServer.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const response = await postWithCsrf(address.port, 'signup', validSignup);
    const result = await response.json() as { user: Record<string, unknown> };

    assert.equal(response.status, 201);
    assert.equal(storedUser?.username, 'maker_one');
    assert.equal(storedUser?.email, 'maker@example.com');
    assert.ok(storedUser?.passwordHash.startsWith('$argon2id$'));
    assert.equal(await argon2.verify(storedUser!.passwordHash, validSignup.password), true);
    assert.equal('password' in result.user, false);
    assert.equal('passwordHash' in result.user, false);
    assert.equal('password_hash' in result.user, false);
    assert.equal('email' in result.user, false);
    assert.equal(result.user.username, 'maker_one');
  } finally {
    await new Promise<void>((resolve, reject) => {
      appServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('signup rejects invalid input without attempting user creation', async () => {
  let createCalled = false;
  const appServer = createTestServer({
    async create() {
      createCalled = true;
      throw new Error('Should not be called for invalid data');
    },
  });
  await new Promise<void>((resolve) => appServer.listen(0, '127.0.0.1', resolve));
  const address = appServer.address();
  assert.ok(address && typeof address !== 'string');

  try {
    const response = await postWithCsrf(address.port, 'signup', {
      ...validSignup,
      username: 'X',
      password: 'short',
    });
    const result = await response.json() as { fields: Record<string, string> };

    assert.equal(response.status, 400);
    assert.ok(result.fields.username);
    assert.ok(result.fields.password);
    assert.equal(createCalled, false);
  } finally {
    await new Promise<void>((resolve, reject) => {
      appServer.close((error) => error ? reject(error) : resolve());
    });
  }
});

test('signup returns safe conflict responses for duplicate username and email', async () => {
  for (const [constraint, field] of [
    ['users_username_lower_unique', 'username'],
    ['users_email_lower_unique', 'email'],
  ] as const) {
    const appServer = createTestServer({
      async create() {
        throw Object.assign(new Error('duplicate'), { code: '23505', constraint });
      },
    });
    await new Promise<void>((resolve) => appServer.listen(0, '127.0.0.1', resolve));
    const address = appServer.address();
    assert.ok(address && typeof address !== 'string');

    try {
      const response = await postWithCsrf(address.port, 'signup', validSignup);
      const result = await response.json() as { field: string; message: string };

      assert.equal(response.status, 409);
      assert.equal(result.field, field);
      assert.match(result.message, new RegExp(field));
      assert.equal(JSON.stringify(result).includes('duplicate'), false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        appServer.close((error) => error ? reject(error) : resolve());
      });
    }
  }
});

test('signup repository uses parameterized values and excludes password hash from RETURNING', async () => {
  let statement = '';
  let parameters: unknown[] = [];
  const repository = createUserRepository({
    async query(text, values) {
      statement = text;
      parameters = values as unknown[];
      return {
        rows: [{
          id: '123e4567-e89b-42d3-a456-426614174000',
          username: 'maker_one',
          email: 'maker@example.com',
          display_name: 'Maker One',
          bio: null,
          avatar_url: null,
          created_at: new Date('2026-01-01T00:00:00.000Z'),
        }],
        command: 'INSERT',
        rowCount: 1,
        oid: 0,
        fields: [],
      };
    },
  });

  await repository.create({
    id: '123e4567-e89b-42d3-a456-426614174000',
    username: 'maker_one',
    email: 'maker@example.com',
    passwordHash: '$argon2id$hash-value',
    displayName: 'Maker One',
    bio: null,
    avatarUrl: null,
  });

  assert.match(statement, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, \$7\)/);
  assert.match(statement, /RETURNING id, username, display_name, bio, avatar_url, created_at/);
  assert.equal(statement.split('RETURNING')[1].includes('password_hash'), false);
  assert.ok(parameters.includes('$argon2id$hash-value'));
});
