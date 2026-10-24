import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import type { PostRecord, PostRepository } from '../src/repositories/post.repository.js';
import type { SocialComment, SocialRepository, PostSocialStats } from '../src/repositories/social.repository.js';
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
process.env.FRONTEND_ORIGINS = 'http://social.test';
process.env.SESSION_SECRET = 'social-test-session-secret-value-at-least-32-bytes';
process.env.DB_USER = 'social_test';
process.env.DB_PASSWORD = 'social_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'social_test';

const [{ createApp }, { postgresSessionStore }, { pool }] = await Promise.all([
  import('../src/app.js'),
  import('../src/config/session.js'),
  import('../src/config/database.js'),
]);

const origin = 'http://social.test';
const userId = '123e4567-e89b-42d3-a456-426614174000';
const otherUserId = '123e4567-e89b-42d3-a456-426614174001';
const postId = '223e4567-e89b-42d3-a456-426614174000';
const password = 'a-long-social-test-password';
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

function createUsers(): UserRepository {
  const profiles: UserProfile[] = [
    {
      id: userId, username: 'maker_one', displayName: 'Maker One', bio: null, avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      id: otherUserId, username: 'maker_two', displayName: 'Maker Two', bio: null,
      avatarUrl: 'https://example.test/avatar.jpg', createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];
  const accounts: UserAccount[] = profiles.map((profile) => ({
    ...profile,
    email: `${profile.username}@example.test`,
    passwordHash,
  }));
  return {
    async create(_user: NewUser) { return profiles[0]; },
    async findByLoginIdentifier(identifier) {
      return accounts.find((account) => account.username === identifier || account.email === identifier) ?? null;
    },
    async findById(id) { return profiles.find((profile) => profile.id === id) ?? null; },
    async findPublicProfile(_username): Promise<PublicProfile | null> { return null; },
    async updateProfile(_id: string, _updates: ProfileUpdates): Promise<UserProfile | null> { return null; },
    async listPublicPosts(_username: string, _limit: number, _offset: number): Promise<PublicPost[]> { return []; },
    async countPublicPosts(_username: string): Promise<number> { return 0; },
  };
}

function createPost(): PostRecord {
  return {
    id: postId,
    title: 'A painted landscape',
    description: 'A detailed creative work description.',
    creatorId: otherUserId,
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
      id: otherUserId, username: 'maker_two', name: 'Maker Two', handle: 'maker_two',
      bio: null, avatarUrl: 'https://example.test/avatar.jpg',
    },
  };
}

function createPosts(): PostRepository {
  const post = createPost();
  return {
    async list() { return { posts: [post], total: 1 }; },
    async findById(id) { return id === postId ? post : null; },
    async listInspiredWorks() { return []; },
    async create() { return post; },
    async update() { return null; },
    async delete() { return { deleted: false, cleanupPublicIds: [], unresolvedMediaUrls: [] }; },
    async completeMediaCleanup() {},
    async recordMediaCleanupFailure() {},
    async listPendingMediaCleanup() { return []; },
    async listUnresolvedMediaCleanup() { return []; },
  };
}

function createSocial(): SocialRepository & {
  setPostActive(active: boolean): void;
  setFailure(active: boolean): void;
} {
  const likes = new Set<string>();
  const reposts = new Set<string>();
  const comments = new Map<string, SocialComment>();
  let active = true;
  let fail = false;
  const key = (user: string, post: string) => `${user}:${post}`;
  function stats(viewerId: string | null): Map<string, PostSocialStats> {
    if (!active) return new Map();
    const postLikes = [...likes].filter((entry) => entry.endsWith(`:${postId}`));
    const postReposts = [...reposts].filter((entry) => entry.endsWith(`:${postId}`));
    const postComments = [...comments.values()].filter((comment) => comment.postId === postId);
    return new Map([[postId, {
      postId,
      likesCount: postLikes.length,
      commentsCount: postComments.length,
      repostsCount: postReposts.length,
      likedByMe: viewerId ? likes.has(key(viewerId, postId)) : false,
      repostedByMe: viewerId ? reposts.has(key(viewerId, postId)) : false,
    }]]);
  }
  return {
    setPostActive(value) { active = value; },
    setFailure(value) { fail = value; },
    async getPostStats(ids, viewerId) {
      if (fail) throw new Error('controlled repository failure');
      return ids.includes(postId) ? stats(viewerId) : new Map();
    },
    async changeLike(id, user, liked) {
      if (id !== postId || !active) return 'not_found';
      const entry = key(user, id);
      const existed = likes.has(entry);
      if (liked) likes.add(entry);
      else likes.delete(entry);
      return existed === liked ? 'unchanged' : 'changed';
    },
    async listComments(id) {
      if (id !== postId || !active) return null;
      const items = [...comments.values()].filter((comment) => comment.postId === id);
      return { comments: items, total: items.length };
    },
    async createComment(id, user, text) {
      if (id !== postId || !active) return null;
      const author = user === userId
        ? { username: 'maker_one', displayName: 'Maker One', avatarUrl: null }
        : { username: 'maker_two', displayName: 'Maker Two', avatarUrl: 'https://example.test/avatar.jpg' };
      const comment: SocialComment = {
        id: randomUUID(),
        postId: id,
        userId: user,
        text,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        author,
      };
      comments.set(comment.id, comment);
      return comment;
    },
    async deleteComment(id, user, targetPostId) {
      const comment = comments.get(id);
      if (!comment || comment.userId !== user || comment.postId !== targetPostId || !active) return null;
      comments.delete(id);
      return comment.postId;
    },
    async changeRepost(id, user, reposted) {
      if (id !== postId || !active) return { result: 'not_found' };
      const entry = key(user, id);
      const existed = reposts.has(entry);
      if (reposted) {
        reposts.add(entry);
        return { result: existed ? 'unchanged' : 'changed', repostId: `${user}-repost` };
      }
      reposts.delete(entry);
      return { result: existed ? 'changed' : 'unchanged', repostId: existed ? `${user}-repost` : undefined };
    },
    async getRepostActivity(id) {
      const user = id.startsWith(userId) ? userId : otherUserId;
      return {
        id,
        userId: user,
        username: user === userId ? 'maker_one' : 'maker_two',
        displayName: user === userId ? 'Maker One' : 'Maker Two',
        avatarUrl: null,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      };
    },
  };
}

async function startApp(social: ReturnType<typeof createSocial>) {
  const session = await import('express-session').then(({ default: expressSession }) =>
    new expressSession.MemoryStore());
  const server = createServer(createApp({
    users: createUsers(),
    posts: createPosts(),
    social,
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

async function authenticate(baseUrl: string, username = 'maker_one') {
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
    body: JSON.stringify({ identifier: username, password }),
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { csrfToken: string };
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  return { cookie, csrfToken: body.csrfToken };
}

function headers(auth: { cookie: string; csrfToken: string }) {
  return {
    origin,
    cookie: auth.cookie,
    'x-csrf-token': auth.csrfToken,
    'content-type': 'application/json',
  };
}

test('likes are persistent, idempotent, authenticated, and excluded for unavailable posts', async () => {
  const social = createSocial();
  const app = await startApp(social);
  try {
    const unauthenticated = await fetch(`${app.baseUrl}/api/posts/${postId}/like`, {
      method: 'POST', headers: { origin },
    });
    assert.equal(unauthenticated.status, 401);

    const auth = await authenticate(app.baseUrl);
    const missingCsrf = await fetch(`${app.baseUrl}/api/posts/${postId}/like`, {
      method: 'POST', headers: { origin, cookie: auth.cookie },
    });
    assert.equal(missingCsrf.status, 403);
    const like = await fetch(`${app.baseUrl}/api/posts/${postId}/like`, {
      method: 'POST', headers: headers(auth),
    });

    assert.deepEqual(await like.json(), {
      status: 'ok', postId, likesCount: 1, commentsCount: 0, repostsCount: 0,
      likedByMe: true, repostedByMe: false,
    });
    const duplicate = await fetch(`${app.baseUrl}/api/posts/${postId}/like`, {
      method: 'POST', headers: headers(auth),
    });
    assert.equal((await duplicate.json() as PostSocialStats).likesCount, 1);

    const feed = await fetch(`${app.baseUrl}/api/posts`, { headers: { cookie: auth.cookie } });
    const post = ((await feed.json()) as { posts: Array<PostRecord & PostSocialStats> }).posts[0];
    assert.equal(post.likedByMe, true);

    const unlike = await fetch(`${app.baseUrl}/api/posts/${postId}/like`, {
      method: 'DELETE', headers: headers(auth),
    });
    assert.equal((await unlike.json() as PostSocialStats).likesCount, 0);
    social.setPostActive(false);
    const deletedPost = await fetch(`${app.baseUrl}/api/posts/${postId}/like`, {
      method: 'POST', headers: headers(auth),
    });
    assert.equal(deletedPost.status, 404);
  } finally {
    await app.close();
  }
});

test('social endpoint returns a generic server error when its repository fails', async () => {
  const social = createSocial();
  social.setFailure(true);
  const app = await startApp(social);
  try {
    const response = await fetch(`${app.baseUrl}/api/posts`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      status: 'error',
      message: 'Internal server error',
    });
  } finally {
    await app.close();
  }
});

test('comments validate content, expose safe author data, and enforce owner deletion', async () => {
  const social = createSocial();
  const app = await startApp(social);
  try {
    const auth = await authenticate(app.baseUrl);
    const other = await authenticate(app.baseUrl, 'maker_two');
    const unauthorized = await fetch(`${app.baseUrl}/api/posts/${postId}/comments`, {
      method: 'POST', headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'No session' }),
    });
    assert.equal(unauthorized.status, 401);

    const invalid = await fetch(`${app.baseUrl}/api/posts/${postId}/comments`, {
      method: 'POST', headers: headers(auth), body: JSON.stringify({ text: '   ' }),
    });
    assert.equal(invalid.status, 400);
    const tooLong = await fetch(`${app.baseUrl}/api/posts/${postId}/comments`, {
      method: 'POST', headers: headers(auth), body: JSON.stringify({ text: 'x'.repeat(301) }),
    });
    assert.equal(tooLong.status, 400);

    const created = await fetch(`${app.baseUrl}/api/posts/${postId}/comments`, {
      method: 'POST', headers: headers(auth), body: JSON.stringify({ text: 'Beautiful work' }),
    });
    const result = await created.json() as { comment: SocialComment; commentCount: number };
    assert.equal(created.status, 201);
    assert.equal(result.comment.author.username, 'maker_one');
    assert.equal(result.commentCount, 1);

    const listed = await fetch(`${app.baseUrl}/api/posts/${postId}/comments`);
    assert.equal((await listed.json() as { commentCount: number }).commentCount, 1);
    const wrongPostDelete = await fetch(`${app.baseUrl}/api/posts/323e4567-e89b-42d3-a456-426614174000/comments/${result.comment.id}`, {
      method: 'DELETE', headers: headers(auth),
    });
    assert.equal(wrongPostDelete.status, 404);
    const deniedDelete = await fetch(`${app.baseUrl}/api/posts/${postId}/comments/${result.comment.id}`, {
      method: 'DELETE', headers: headers(other),
    });
    assert.equal(deniedDelete.status, 404);
    const deleted = await fetch(`${app.baseUrl}/api/posts/${postId}/comments/${result.comment.id}`, {
      method: 'DELETE', headers: headers(auth),
    });
    assert.equal((await deleted.json() as { commentCount: number }).commentCount, 0);

    social.setPostActive(false);
    const unavailable = await fetch(`${app.baseUrl}/api/posts/${postId}/comments`, {
      method: 'POST', headers: headers(auth), body: JSON.stringify({ text: 'Unavailable' }),
    });
    assert.equal(unavailable.status, 404);
  } finally {
    await app.close();
  }
});

test('reposts are references, idempotent, authenticated, and rejected for deleted sources', async () => {
  const social = createSocial();
  const app = await startApp(social);
  try {
    const unauthenticated = await fetch(`${app.baseUrl}/api/posts/${postId}/repost`, {
      method: 'POST', headers: { origin },
    });
    assert.equal(unauthenticated.status, 401);
    const auth = await authenticate(app.baseUrl);
    const repost = await fetch(`${app.baseUrl}/api/posts/${postId}/repost`, {
      method: 'POST', headers: headers(auth),
    });
    const result = await repost.json() as PostSocialStats;
    assert.equal(result.repostsCount, 1);
    assert.equal(result.repostedByMe, true);
    assert.equal((result as PostSocialStats & { repostActivity: { userId: string } }).repostActivity.userId, userId);
    const duplicate = await fetch(`${app.baseUrl}/api/posts/${postId}/repost`, {
      method: 'POST', headers: headers(auth),
    });
    assert.equal((await duplicate.json() as PostSocialStats).repostsCount, 1);

    social.setPostActive(false);
    const deletedPost = await fetch(`${app.baseUrl}/api/posts/${postId}/repost`, {
      method: 'POST', headers: headers(auth),
    });
    assert.equal(deletedPost.status, 404);
  } finally {
    await app.close();
  }
});

after(async () => {
  postgresSessionStore.close();
  await pool.end();
});
