import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type { ImageStorage } from '../src/services/cloudinaryImageStorage.js';
import type { NewUser, UserAccount, UserProfile, UserRepository } from '../src/repositories/user.repository.js';

process.env.NODE_ENV = 'test';
process.env.FRONTEND_ORIGINS = 'http://uploads.test';
process.env.SESSION_SECRET = 'uploads-test-session-secret-value-at-least-32-bytes';
process.env.DB_USER = 'uploads_test';
process.env.DB_PASSWORD = 'uploads_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'uploads_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://uploads.test';
const userId = '123e4567-e89b-42d3-a456-426614174000';
const password = 'a-long-upload-test-password';
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

function createUsers(): UserRepository {
  const profile: UserProfile = {
    id: userId,
    username: 'upload_user',
    displayName: 'Upload User',
    bio: null,
    avatarUrl: null,
    createdAt: new Date(),
  };
  const account: UserAccount = { ...profile, email: 'upload@example.test', passwordHash };
  return {
    async create(_user: NewUser) { return profile; },
    async findByLoginIdentifier(identifier) { return identifier === 'upload_user' ? account : null; },
    async findById(id) { return id === userId ? profile : null; },
    async findPublicProfile() { return null; },
    async updateProfile() { return null; },
    async listPublicPosts() { return []; },
    async countPublicPosts() { return 0; },
  };
}

function createStorage(configured = true, fail = false): ImageStorage & { calls: string[] } {
  const calls: string[] = [];
  return {
    configured,
    calls,
    async upload(owner, uploadId, buffer) {
      calls.push(`${owner}:${uploadId}:${buffer.length}`);
      if (fail) throw new Error('private provider details');
      return { uploadId, url: `https://res.cloudinary.com/test/image/upload/${uploadId}.jpg` };
    },
    async verifyOwned(owner, uploadId) { return owner === userId && Boolean(uploadId); },
    async deleteAsset() {},
  };
}

async function startApp(storage: ImageStorage) {
  const session = await import('express-session').then(({ default: expressSession }) =>
    new expressSession.MemoryStore());
  const server = createServer(createApp({
    users: createUsers(),
    imageStorage: storage,
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
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', origin, cookie: initialCookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ identifier: 'upload_user', password }),
  });
  const result = await response.json() as { csrfToken: string };
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrfToken: result.csrfToken };
}

function imageForm(bytes: number[] | Uint8Array = [137, 80, 78, 71, 13, 10, 26, 10]) {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'work.png');
  return form;
}

test('image upload requires login, CSRF, and an idempotency key', async () => {
  const storage = createStorage();
  const app = await startApp(storage);
  try {
    const unauthenticated = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST', body: imageForm(),
    });
    assert.equal(unauthenticated.status, 401);

    const auth = await authenticate(app.baseUrl);
    const noKey = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST',
      headers: { origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken },
      body: imageForm(),
    });
    assert.equal(noKey.status, 400);

    const badCsrf = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST',
      headers: { origin, cookie: auth.cookie, 'x-csrf-token': 'invalid', 'idempotency-key': randomUUID() },
      body: imageForm(),
    });
    assert.equal(badCsrf.status, 403);
  } finally {
    await app.close();
  }
});

test('image upload validates image bytes and returns a safe upload result', async () => {
  const storage = createStorage();
  const app = await startApp(storage);
  try {
    const auth = await authenticate(app.baseUrl);
    const headers = {
      origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken,
      'idempotency-key': '223e4567-e89b-42d3-a456-426614174000',
    };
    const invalid = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST', headers, body: imageForm([0, 1, 2, 3]),
    });
    assert.equal(invalid.status, 400);
    assert.equal(storage.calls.length, 0);

    const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    oversizedBytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const oversized = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST',
      headers: { ...headers, 'idempotency-key': randomUUID() },
      body: imageForm(oversizedBytes),
    });
    assert.equal(oversized.status, 413);
    assert.equal(storage.calls.length, 0);

    const response = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST', headers, body: imageForm(),
    });
    const result = await response.json() as { asset: { uploadId: string; url: string; type: string } };
    assert.equal(response.status, 201);
    assert.equal(result.asset.uploadId, headers['idempotency-key']);
    assert.equal(result.asset.type, 'image');
    assert.ok(result.asset.url.startsWith('https://'));
    assert.equal(storage.calls.length, 1);
  } finally {
    await app.close();
  }
});

test('image uploads are rate-limited per authenticated user', async () => {
  const storage = createStorage();
  const app = await startApp(storage);
  try {
    const auth = await authenticate(app.baseUrl);
    let lastResponse: Response | undefined;
    for (let attempt = 0; attempt < 21; attempt += 1) {
      lastResponse = await fetch(`${app.baseUrl}/api/uploads/images`, {
        method: 'POST',
        headers: {
          origin,
          cookie: auth.cookie,
          'x-csrf-token': auth.csrfToken,
          'idempotency-key': randomUUID(),
        },
        body: imageForm(),
      });
    }

    assert.equal(lastResponse?.status, 429);
    assert.ok(Number(lastResponse?.headers.get('retry-after')) > 0);
    assert.equal(storage.calls.length, 20);
  } finally {
    await app.close();
  }
});

test('image upload failures do not expose provider details and missing configuration is explicit', async () => {
  for (const [storage, expected] of [
    [createStorage(true, true), 502],
    [createStorage(false), 503],
  ] as const) {
    const app = await startApp(storage);
    try {
      const auth = await authenticate(app.baseUrl);
      const response = await fetch(`${app.baseUrl}/api/uploads/images`, {
        method: 'POST',
        headers: {
          origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken,
          'idempotency-key': randomUUID(),
        },
        body: imageForm(),
      });
      const body = await response.text();
      assert.equal(response.status, expected);
      assert.equal(body.includes('private provider details'), false);
    } finally {
      await app.close();
    }
  }
});

test('image upload logs only safe provider failure classifications', async () => {
  const app = await startApp(createStorage(true, true));
  const originalError = console.error;
  const logCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => { logCalls.push(args); };
  try {
    const auth = await authenticate(app.baseUrl);
    const response = await fetch(`${app.baseUrl}/api/uploads/images`, {
      method: 'POST',
      headers: {
        origin, cookie: auth.cookie, 'x-csrf-token': auth.csrfToken,
        'idempotency-key': randomUUID(),
      },
      body: imageForm(),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(logCalls, [['Cloudinary image upload failed.', { errorType: 'Error' }]]);
  } finally {
    console.error = originalError;
    await app.close();
  }
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
