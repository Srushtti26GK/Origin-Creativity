import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type {
  NewPost,
  PostRecord,
  PostRepository,
  PostUpdates,
} from '../src/repositories/post.repository.js';
import type { SocialRepository, PostSocialStats } from '../src/repositories/social.repository.js';
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
process.env.FRONTEND_ORIGINS = 'http://posts.test';
process.env.SESSION_SECRET = 'posts-test-session-secret-value-at-least-32-bytes';
process.env.DB_USER = 'posts_test';
process.env.DB_PASSWORD = 'posts_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'posts_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://posts.test';
const userId = '123e4567-e89b-42d3-a456-426614174000';
const otherUserId = '123e4567-e89b-42d3-a456-426614174001';
const postId = '223e4567-e89b-42d3-a456-426614174000';
const password = 'a-long-post-test-password';
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

function createUsers(): UserRepository {
  const profile: UserProfile = {
    id: userId,
    username: 'maker_one',
    displayName: 'Maker One',
    bio: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const account: UserAccount = {
    ...profile,
    email: 'maker@example.test',
    passwordHash,
  };
  return {
    async create(_user: NewUser) { return profile; },
    async findByLoginIdentifier(identifier) {
      return identifier === profile.username || identifier === account.email ? account : null;
    },
    async findById(id) { return id === profile.id ? profile : null; },
    async findPublicProfile(_username): Promise<PublicProfile | null> { return null; },
    async updateProfile(_id: string, _updates: ProfileUpdates): Promise<UserProfile | null> { return null; },
    async listPublicPosts(_username: string, _limit: number, _offset: number): Promise<PublicPost[]> { return []; },
    async countPublicPosts(_username: string): Promise<number> { return 0; },
  };
}

function postRecord(ownerId = userId, id = postId): PostRecord {
  return {
    id,
    title: 'A painted landscape',
    description: 'A detailed creative work description.',
    creatorId: ownerId,
    category: 'painting',
    tags: ['landscape'],
    media: [{ type: 'image', url: 'https://example.test/work.jpg', alt: null, aspect: null }],
    workType: 'original',
    sourcePostId: null,
    inspirationNote: null,
    authenticity: { declaration: 'original', verificationStatus: 'unverified' },
    likesCount: 0,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    creator: {
      id: ownerId,
      username: 'maker_one',
      name: 'Maker One',
      handle: 'maker_one',
      bio: null,
      avatarUrl: null,
    },
  };
}

function createPosts(ownerId = userId): PostRepository & {
  calls: { created?: NewPost; updated?: { id: string; userId: string; changes: PostUpdates }; deleted?: { id: string; userId: string } };
} {
  const calls: { created?: NewPost; updated?: { id: string; userId: string; changes: PostUpdates }; deleted?: { id: string; userId: string } } = {};
  const stored = new Map([[postId, postRecord(ownerId)]]);
  return {
    calls,
    async list(pageSize, offset) {
      const all = [...stored.values()].filter((post) => post.creatorId === ownerId);
      return { posts: all.slice(offset, offset + pageSize), total: all.length };
    },
    async findById(id) { return stored.get(id) ?? null; },
    async listInspiredWorks(sourceId) {
      return [...stored.values()].filter((post) => post.sourcePostId === sourceId);
    },
    async create(input) {
      calls.created = input;
      if (input.sourcePostId && !stored.has(input.sourcePostId)) {
        throw Object.assign(new Error('Source post not found'), { code: 'SOURCE_POST_NOT_FOUND' });
      }
      const created = {
        ...postRecord(input.userId, '323e4567-e89b-42d3-a456-426614174000'),
        workType: input.workType,
        sourcePostId: input.sourcePostId,
        inspirationNote: input.inspirationNote,
        authenticity: { declaration: input.workType, verificationStatus: 'unverified' },
      };
      stored.set(created.id, created);
      return created;
    },
    async update(id, currentUserId, changes) {
      calls.updated = { id, userId: currentUserId, changes };
      const existing = stored.get(id);
      if (!existing || existing.creatorId !== currentUserId) return null;
      const updated = { ...existing, ...changes };
      stored.set(id, updated);
      return updated;
    },
    async delete(id, currentUserId) {
      calls.deleted = { id, userId: currentUserId };
      const existing = stored.get(id);
      if (!existing || existing.creatorId !== currentUserId) return false;
      stored.delete(id);
      return true;
    },
  };
}

function createSocial(): SocialRepository {
  return {
    async getPostStats(postIds, viewerId) {
      return new Map<string, PostSocialStats>(postIds.map((id) => [id, {
        postId: id,
        likesCount: 3,
        commentsCount: 2,
        repostsCount: 1,
        likedByMe: viewerId === userId,
        repostedByMe: false,
      }]));
    },
    async changeLike() { return 'unchanged'; },
    async listComments() { return { comments: [], total: 0 }; },
    async createComment() { return null; },
    async deleteComment() { return null; },
    async changeRepost() { return { result: 'unchanged' }; },
    async getRepostActivity() { return null; },
  };
}

async function startApp(posts: PostRepository) {
  const session = await import('express-session').then(({ default: expressSession }) =>
    new expressSession.MemoryStore());
  const server = createServer(createApp({ users: createUsers(), posts, social: createSocial(), sessionStore: session }));
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
      'content-type': 'application/json',
      origin,
      cookie: initialCookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({ identifier: 'maker_one', password }),
  });
  assert.equal(loginResponse.status, 200);
  const loggedIn = await loginResponse.json() as { csrfToken: string };
  const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrfToken: loggedIn.csrfToken };
}

function mutationHeaders(auth: { cookie: string; csrfToken: string }) {
  return {
    'content-type': 'application/json',
    origin,
    cookie: auth.cookie,
    'x-csrf-token': auth.csrfToken,
  };
}

const validPost = {
  title: 'New painting',
  description: 'A carefully described painting with enough detail.',
  category: 'painting',
  tags: ['landscape', 'watercolor'],
  workType: 'original',
  sourcePostId: null,
  inspirationNote: null,
  media: [{ type: 'image', url: 'https://example.test/new-work.jpg', alt: 'A painted view', aspect: 'landscape' }],
};

test('public post listing paginates and returns creator profile and timestamp data', async () => {
  const repository = createPosts();
  const app = await startApp(repository);
  try {
    const response = await fetch(`${app.baseUrl}/api/posts?page=1&limit=1`);
    const result = await response.json() as {
      posts: PostRecord[];
      pagination: { page: number; pageSize: number; total: number; totalPages: number };
    };
    assert.equal(response.status, 200);
    assert.equal(result.posts.length, 1);
    assert.equal(result.posts[0].creator.name, 'Maker One');
    assert.equal(result.posts[0].createdAt, '2026-01-02T00:00:00.000Z');
    assert.equal(result.posts[0].likesCount, 3);
    assert.equal(result.posts[0].commentsCount, 2);
    assert.equal(result.posts[0].repostsCount, 1);
    assert.deepEqual(result.pagination, { page: 1, pageSize: 1, total: 1, totalPages: 1 });
  } finally {
    await app.close();
  }
});

test('post creation requires authentication and valid CSRF, and uses session ownership', async () => {
  const repository = createPosts();
  const app = await startApp(repository);
  try {
    const csrfResponse = await fetch(`${app.baseUrl}/api/auth/csrf`);
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const cookie = csrfResponse.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const unauthenticated = await fetch(`${app.baseUrl}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie, 'x-csrf-token': csrfToken },
      body: JSON.stringify(validPost),
    });
    assert.equal(unauthenticated.status, 401);

    const auth = await authenticate(app.baseUrl);
    const response = await fetch(`${app.baseUrl}/api/posts`, {
      method: 'POST',
      headers: mutationHeaders(auth),
      body: JSON.stringify({ ...validPost, userId: otherUserId }),
    });
    assert.equal(response.status, 400);

    const validResponse = await fetch(`${app.baseUrl}/api/posts`, {
      method: 'POST',
      headers: mutationHeaders(auth),
      body: JSON.stringify(validPost),
    });
    const result = await validResponse.json() as { post: PostRecord };
    assert.equal(validResponse.status, 201);
    assert.equal(result.post.creatorId, userId);
    assert.equal(repository.calls.created?.userId, userId);
    assert.equal(repository.calls.created?.media[0].url, validPost.media[0].url);
  } finally {
    await app.close();
  }
});

test('post creation rejects invalid categories, unsafe media URLs, and missing CSRF', async () => {
  const app = await startApp(createPosts());
  try {
    const auth = await authenticate(app.baseUrl);
    for (const body of [
      { ...validPost, category: 'unknown' },
      { ...validPost, media: [{ type: 'image', url: 'javascript:alert(1)' }] },
      { ...validPost, description: 'short' },
    ]) {
      const response = await fetch(`${app.baseUrl}/api/posts`, {
        method: 'POST',
        headers: mutationHeaders(auth),
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    const missingCsrf = await fetch(`${app.baseUrl}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie: auth.cookie },
      body: JSON.stringify(validPost),
    });
    assert.equal(missingCsrf.status, 403);
  } finally {
    await app.close();
  }
});

test('recreate creates a separate user-owned work with source attribution and rejects unavailable sources', async () => {
  const repository = createPosts(otherUserId);
  const app = await startApp(repository);
  try {
    const auth = await authenticate(app.baseUrl);
    const inspired = {
      ...validPost,
      workType: 'inspired',
      sourcePostId: postId,
      inspirationNote: 'I explored the color palette in my own way.',
    };
    const response = await fetch(`${app.baseUrl}/api/posts`, {
      method: 'POST',
      headers: mutationHeaders(auth),
      body: JSON.stringify(inspired),
    });
    const result = await response.json() as { post: PostRecord };
    assert.equal(response.status, 201);
    assert.equal(repository.calls.created?.userId, userId);
    assert.equal(repository.calls.created?.sourcePostId, postId);
    assert.equal(result.post.creatorId, userId);
    assert.equal(result.post.sourcePostId, postId);
    assert.equal(result.post.workType, 'inspired');

    const missingSource = await fetch(`${app.baseUrl}/api/posts`, {
      method: 'POST',
      headers: mutationHeaders(auth),
      body: JSON.stringify({ ...inspired, sourcePostId: otherUserId }),
    });
    assert.equal(missingSource.status, 404);
  } finally {
    await app.close();
  }
});

test('post editing is authenticated and scoped to the session owner', async () => {
  const repository = createPosts();
  const app = await startApp(repository);
  try {
    const auth = await authenticate(app.baseUrl);
    const unauthenticated = await fetch(`${app.baseUrl}/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ title: 'Changed title' }),
    });
    assert.equal(unauthenticated.status, 401);

    const update = await fetch(`${app.baseUrl}/api/posts/${postId}`, {
      method: 'PATCH',
      headers: mutationHeaders(auth),
      body: JSON.stringify({ title: 'Edited title', tags: ['updated'] }),
    });
    const result = await update.json() as { post: PostRecord };
    assert.equal(update.status, 200);
    assert.equal(result.post.title, 'Edited title');
    assert.equal(repository.calls.updated?.userId, userId);

    const otherOwnerApp = await startApp(createPosts(otherUserId));
    try {
      const otherAuth = await authenticate(otherOwnerApp.baseUrl);
      const forbidden = await fetch(`${otherOwnerApp.baseUrl}/api/posts/${postId}`, {
        method: 'PATCH',
        headers: mutationHeaders(otherAuth),
        body: JSON.stringify({ title: 'Not yours' }),
      });
      assert.equal(forbidden.status, 404);
    } finally {
      await otherOwnerApp.close();
    }
  } finally {
    await app.close();
  }
});

test('post deletion is authenticated, soft-deletes through repository, and is owner-only', async () => {
  const repository = createPosts();
  const app = await startApp(repository);
  try {
    const auth = await authenticate(app.baseUrl);
    const unauthenticated = await fetch(`${app.baseUrl}/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { origin },
    });
    assert.equal(unauthenticated.status, 401);

    const response = await fetch(`${app.baseUrl}/api/posts/${postId}`, {
      method: 'DELETE',
      headers: mutationHeaders(auth),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(repository.calls.deleted, { id: postId, userId });

    const otherOwnerApp = await startApp(createPosts(otherUserId));
    try {
      const otherAuth = await authenticate(otherOwnerApp.baseUrl);
      const forbidden = await fetch(`${otherOwnerApp.baseUrl}/api/posts/${postId}`, {
        method: 'DELETE',
        headers: mutationHeaders(otherAuth),
      });
      assert.equal(forbidden.status, 404);
    } finally {
      await otherOwnerApp.close();
    }
  } finally {
    await app.close();
  }
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
