import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type { NewUser, UserAccount, UserProfile, UserRepository } from '../src/repositories/user.repository.js';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://frontend.test';
process.env.SESSION_SECRET = 'auth-session-test-secret-value-at-least-32-bytes';
process.env.DB_USER = 'auth_session_test';
process.env.DB_PASSWORD = 'auth_session_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'auth_session_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://frontend.test';
const password = 'a-long-test-password';

function createUsers(): UserRepository {
  const users = new Map<string, UserAccount>();

  return {
    async create(user: NewUser): Promise<UserProfile> {
      if ([...users.values()].some((stored) => stored.username === user.username)) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'users_username_lower_unique',
        });
      }
      if ([...users.values()].some((stored) => stored.email === user.email)) {
        throw Object.assign(new Error('duplicate'), {
          code: '23505',
          constraint: 'users_email_lower_unique',
        });
      }
      const profile: UserProfile = {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      users.set(user.id, {
        ...profile,
        email: user.email,
        passwordHash: user.passwordHash,
      });
      return profile;
    },
    async findByLoginIdentifier(identifier): Promise<UserAccount | null> {
      return [...users.values()].find(
        (user) => user.username === identifier || user.email === identifier,
      ) ?? null;
    },
    async findById(id): Promise<UserProfile | null> {
      const user = users.get(id);
      if (!user) return null;
      const { passwordHash: _passwordHash, email: _email, ...profile } = user;
      return profile;
    },
  };
}

async function startApp(users: UserRepository) {
  const store = await import('express-session').then(({ default: session }) => new session.MemoryStore());
  const server = createServer(createApp({ users, sessionStore: store }));
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

function sessionCookie(response: Response): string | undefined {
  return response.headers.get('set-cookie')?.split(';')[0];
}

test('login persists a regenerated server-side session for /me and logout invalidates it', async () => {
  const users = createUsers();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await users.create({
    id: '123e4567-e89b-42d3-a456-426614174000',
    username: 'maker_one',
    email: 'maker@example.com',
    passwordHash,
    displayName: 'Maker One',
    bio: null,
    avatarUrl: null,
  });
  const app = await startApp(users);

  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const preLoginCookie = sessionCookie(csrfResponse);
    assert.ok(preLoginCookie);
    assert.match(csrfResponse.headers.get('set-cookie') ?? '', /^origin\.sid=/);
    assert.match(csrfResponse.headers.get('set-cookie') ?? '', /HttpOnly/i);
    assert.match(csrfResponse.headers.get('set-cookie') ?? '', /SameSite=Lax/i);

    const failedLogin = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie: preLoginCookie,
        'x-csrf-token': csrf.csrfToken,
      },
      body: JSON.stringify({ identifier: 'maker_one', password: 'wrong-password' }),
    });
    assert.equal(failedLogin.status, 401);
    assert.deepEqual(await failedLogin.json(), {
      status: 'error',
      message: 'Invalid username/email or password',
    });
    assert.equal(failedLogin.headers.get('set-cookie'), null);

    const loginResponse = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie: preLoginCookie,
        'x-csrf-token': csrf.csrfToken,
      },
      body: JSON.stringify({ identifier: 'MAKER@example.com', password }),
    });
    const loginResult = await loginResponse.json() as {
      user: Record<string, unknown>;
      csrfToken: string;
    };
    const authenticatedCookie = sessionCookie(loginResponse);

    assert.equal(loginResponse.status, 200);
    assert.ok(authenticatedCookie);
    assert.notEqual(authenticatedCookie, preLoginCookie);
    assert.equal('passwordHash' in loginResult.user, false);
    assert.equal('password_hash' in loginResult.user, false);
    assert.equal('email' in loginResult.user, false);
    assert.equal(JSON.stringify(loginResult).includes('origin.sid'), false);

    const meResponse = await fetch(`${app.baseUrl}/api/auth/me`, {
      headers: { cookie: authenticatedCookie },
    });
    const meResult = await meResponse.json() as { user: Record<string, unknown> };
    assert.equal(meResponse.status, 200);
    assert.equal(meResult.user.id, '123e4567-e89b-42d3-a456-426614174000');
    assert.equal('passwordHash' in meResult.user, false);
    assert.equal('email' in meResult.user, false);

    const logoutResponse = await fetch(`${app.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        origin,
        cookie: authenticatedCookie,
        'x-csrf-token': loginResult.csrfToken,
      },
    });
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/i);

    const afterLogout = await fetch(`${app.baseUrl}/api/auth/me`, {
      headers: { cookie: authenticatedCookie },
    });
    assert.equal(afterLogout.status, 401);
  } finally {
    await app.close();
  }
});

test('CSRF protection rejects unsafe auth requests with a missing or untrusted origin', async () => {
  const app = await startApp(createUsers());

  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const cookie = sessionCookie(csrfResponse);
    assert.ok(cookie);

    const missingOrigin = await fetch(`${app.baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie,
        'x-csrf-token': csrf.csrfToken,
      },
      body: JSON.stringify({
        username: 'maker_one',
        email: 'maker@example.com',
        password,
        displayName: 'Maker One',
      }),
    });
    assert.equal(missingOrigin.status, 403);

    const invalidOrigin = await fetch(`${app.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        origin: 'https://attacker.test',
        cookie,
        'x-csrf-token': csrf.csrfToken,
      },
    });
    assert.equal(invalidOrigin.status, 403);
  } finally {
    await app.close();
  }
});

test('login rate limiter returns 429 after repeated invalid credentials', async () => {
  const app = await startApp(createUsers());

  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const cookie = sessionCookie(csrfResponse);
    assert.ok(cookie);

    const parallelResponses = await Promise.all(
      Array.from({ length: 10 }, () => fetch(`${app.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          cookie,
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify({
          identifier: 'parallel-rate-limit-check@example.com',
          password,
        }),
      })),
    );
    assert.equal(parallelResponses.filter((response) => response.status === 401).length, 5);
    assert.equal(parallelResponses.filter((response) => response.status === 429).length, 5);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await fetch(`${app.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          cookie,
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify({
          identifier: 'rate-limit-check@example.com',
          password,
        }),
      });
      assert.equal(response.status, 401);
    }

    const limited = await fetch(`${app.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
        cookie,
        'x-csrf-token': csrf.csrfToken,
      },
      body: JSON.stringify({
        identifier: 'rate-limit-check@example.com',
        password,
      }),
    });
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
  } finally {
    await app.close();
  }
});

test('login rate limit applies across rotating identifiers from one IP', async () => {
  const app = await startApp(createUsers());

  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const cookie = sessionCookie(csrfResponse);
    assert.ok(cookie);

    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      lastResponse = await fetch(`${app.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          cookie,
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify({
          identifier: `rotating-${attempt}@example.com`,
          password,
        }),
      });
    }

    assert.equal(lastResponse?.status, 429);
    assert.ok(Number(lastResponse?.headers.get('retry-after')) > 0);
  } finally {
    await app.close();
  }
});

test('signup rate limiter returns 429 after repeated attempts from one IP', async () => {
  const app = await startApp(createUsers());

  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const csrf = await csrfResponse.json() as { csrfToken: string };
    const cookie = sessionCookie(csrfResponse);
    assert.ok(cookie);

    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastResponse = await fetch(`${app.baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          cookie,
          'x-csrf-token': csrf.csrfToken,
        },
        body: JSON.stringify({}),
      });
    }

    assert.equal(lastResponse?.status, 429);
    assert.ok(Number(lastResponse?.headers.get('retry-after')) > 0);
  } finally {
    await app.close();
  }
});

test('malformed JSON is rejected as a client error', async () => {
  const app = await startApp(createUsers());

  try {
    const response = await fetch(`${app.baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: '{',
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      status: 'error',
      message: 'Invalid JSON request body',
    });
  } finally {
    await app.close();
  }
});

test('unauthenticated /me and logout without an existing session behave safely', async () => {
  const app = await startApp(createUsers());

  try {
    const me = await fetch(`${app.baseUrl}/api/auth/me`);
    assert.equal(me.status, 401);

    const logout = await fetch(`${app.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { origin },
    });
    assert.equal(logout.status, 200);
  } finally {
    await app.close();
  }
});

test('default PostgreSQL session store targets the already migrated singular session table', () => {
  assert.ok(postgresSessionStore);
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
