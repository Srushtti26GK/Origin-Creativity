import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PostMediaInput } from '../src/repositories/post.repository.js';
import { createPostRepository } from '../src/repositories/post.repository.js';
import { runCloudinaryCleanupBatch } from '../src/services/cloudinaryCleanup.js';

const ownerId = '123e4567-e89b-42d3-a456-426614174000';
const postId = '223e4567-e89b-42d3-a456-426614174000';
const otherPostId = '323e4567-e89b-42d3-a456-426614174000';
const userId = '423e4567-e89b-42d3-a456-426614174000';
const firstUrl = 'https://res.cloudinary.com/test/image/upload/first.jpg';
const secondUrl = 'https://res.cloudinary.com/test/image/upload/second.jpg';
const thirdUrl = 'https://res.cloudinary.com/test/image/upload/third.jpg';

interface MediaRow {
  post_id: string;
  media_type: 'image';
  media_url: string;
  cloudinary_public_id: string | null;
  alt_text: string | null;
  aspect: string | null;
  position: number;
}

interface State {
  posts: Set<string>;
  media: MediaRow[];
  cleanup: Set<string>;
  unresolved: Set<string>;
  failMediaInsert: boolean;
  rolledBack: boolean;
}

function media(url: string, cloudinaryPublicId?: string): PostMediaInput {
  return {
    type: 'image', url, alt: null, aspect: null,
    ...(cloudinaryPublicId ? { cloudinaryPublicId } : {}),
  };
}

function createRepository(seed: MediaRow[], options: { failMediaInsert?: boolean } = {}) {
  const state: State = {
    posts: new Set([postId, otherPostId]),
    media: seed.map((item) => ({ ...item })),
    cleanup: new Set(),
    unresolved: new Set(),
    failMediaInsert: Boolean(options.failMediaInsert),
    rolledBack: false,
  };
  let transactionSnapshot: Omit<State, 'failMediaInsert' | 'rolledBack'> | undefined;
  let lockCount = 0;

  const query = async <Row = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const statement = sql.replace(/\s+/g, ' ').trim();
    let rows: unknown[] = [];
    let rowCount = 0;

    if (statement === 'BEGIN') {
      transactionSnapshot = {
        posts: new Set(state.posts), media: state.media.map((item) => ({ ...item })),
        cleanup: new Set(state.cleanup), unresolved: new Set(state.unresolved),
      };
    } else if (statement === 'COMMIT') {
      transactionSnapshot = undefined;
    } else if (statement === 'ROLLBACK') {
      state.rolledBack = true;
      if (transactionSnapshot) Object.assign(state, transactionSnapshot);
      transactionSnapshot = undefined;
    } else if (statement.includes('pg_advisory_xact_lock')) {
      lockCount += 1;
      rowCount = 1;
    } else if (statement.startsWith('SELECT id FROM posts WHERE id = $1 AND user_id = $2')) {
      rows = state.posts.has(String(params[0])) && String(params[1]) === ownerId ? [{ id: params[0] }] : [];
      rowCount = rows.length;
    } else if (statement.startsWith('SELECT media_type, media_url, cloudinary_public_id')) {
      rows = state.media.filter((item) => item.post_id === params[0]).sort((a, b) => a.position - b.position);
      rowCount = rows.length;
    } else if (statement.startsWith('SELECT 1 WHERE EXISTS')) {
      const [ids, urls] = params as [string[], string[]];
      const pending = ids.some((id) => state.cleanup.has(id)) || urls.some((url) => state.unresolved.has(url));
      rows = pending ? [{ '?column?': 1 }] : [];
      rowCount = rows.length;
    } else if (statement.startsWith('SELECT 1 FROM post_media')) {
      const [excludedPostId, publicIdOrUrl, urlOrUrls] = params;
      const hasPublicIdCheck = statement.includes('cloudinary_public_id');
      const urls = Array.isArray(urlOrUrls) ? urlOrUrls : [urlOrUrls];
      const shared = state.media.some((item) => item.post_id !== excludedPostId && (
        hasPublicIdCheck
          ? item.cloudinary_public_id === publicIdOrUrl || urls.includes(item.media_url)
          : item.media_url === publicIdOrUrl
      ));
      rows = shared ? [{ '?column?': 1 }] : [];
      rowCount = rows.length;
    } else if (statement.startsWith('UPDATE posts SET')) {
      rowCount = state.posts.has(String(params[0])) && String(params[1]) === ownerId ? 1 : 0;
    } else if (statement.startsWith('UPDATE notifications SET post_id = NULL')) {
      rowCount = 0;
    } else if (/^DELETE FROM (likes|comments|reposts) WHERE/.test(statement)) {
      rowCount = 0;
    } else if (statement.startsWith('DELETE FROM posts WHERE id = $1 AND user_id = $2')) {
      const deleted = String(params[1]) === ownerId && state.posts.delete(String(params[0]));
      if (deleted) state.media = state.media.filter((item) => item.post_id !== params[0]);
      rows = deleted ? [{ id: params[0] }] : [];
      rowCount = rows.length;
    } else if (statement.startsWith('DELETE FROM post_media WHERE post_id = $1')) {
      state.media = state.media.filter((item) => item.post_id !== params[0]);
      rowCount = 1;
    } else if (statement.startsWith('INSERT INTO post_media')) {
      if (state.failMediaInsert) throw new Error('simulated insert failure');
      const [, mediaPostId, type, url, alt, aspect, position, publicId] = params;
      state.media.push({
        post_id: String(mediaPostId), media_type: type as 'image', media_url: String(url),
        alt_text: alt as string | null, aspect: aspect as string | null,
        position: Number(position), cloudinary_public_id: publicId as string | null,
      });
      rowCount = 1;
    } else if (statement.startsWith('INSERT INTO cloudinary_cleanup ')) {
      state.cleanup.add(String(params[0]));
      rowCount = 1;
    } else if (statement.startsWith('INSERT INTO cloudinary_cleanup_unresolved')) {
      state.unresolved.add(String(params[0]));
      rowCount = 1;
    } else if (statement.includes('json_agg(json_build_object')) {
      if (state.posts.has(String(params[0]))) {
        const postMedia = state.media.filter((item) => item.post_id === params[0]).sort((a, b) => a.position - b.position);
        rows = [{
          id: params[0], title: 'Artwork', description: 'A sufficiently detailed description.', user_id: ownerId,
          category: 'painting', tags: [], work_type: 'original', source_post_id: null,
          inspiration_note: null, authenticity_declaration: 'original', verification_status: 'unverified',
          created_at: new Date(), creator_username: 'maker', creator_display_name: 'Maker',
          creator_bio: null, creator_avatar_url: null,
          media: postMedia.map((item) => ({ type: item.media_type, url: item.media_url, alt: item.alt_text, aspect: item.aspect })),
        }];
        rowCount = 1;
      }
    } else {
      throw new Error(`Unexpected test SQL: ${statement}`);
    }

    return { rows, rowCount } as unknown as { rows: Row[]; rowCount: number };
  };

  const client = { query, release() {} };
  const pool = { query, async connect() { return client; } };
  return { repository: createPostRepository(pool as never), state, get lockCount() { return lockCount; } };
}

function initialMedia(url: string, publicId: string, position = 0, id = postId): MediaRow {
  return {
    post_id: id, media_type: 'image', media_url: url,
    cloudinary_public_id: publicId, alt_text: null, aspect: null, position,
  };
}

test('text-only edits leave stored media rows and public IDs untouched', async () => {
  const existing = initialMedia(firstUrl, 'asset/first');
  const { repository, state } = createRepository([existing]);
  const updated = await repository.update(postId, ownerId, { title: 'Updated title' });
  assert.equal(updated?.title, 'Artwork');
  assert.deepEqual(state.media, [existing]);
});

test('retained media keeps its database public ID when reordered', async () => {
  const { repository, state } = createRepository([
    initialMedia(firstUrl, 'asset/first', 0),
    initialMedia(secondUrl, 'asset/second', 1),
  ]);
  await repository.update(postId, ownerId, { media: [media(secondUrl), media(firstUrl)] });
  assert.deepEqual(state.media.filter((item) => item.post_id === postId).map((item) => [item.media_url, item.cloudinary_public_id]), [
    [secondUrl, 'asset/second'], [firstUrl, 'asset/first'],
  ]);
});

test('a newly uploaded image keeps its server-assigned public ID alongside retained media', async () => {
  const { repository, state } = createRepository([initialMedia(firstUrl, 'asset/first')]);
  await repository.update(postId, ownerId, {
    media: [media(firstUrl), media(thirdUrl, 'asset/third')],
  });
  assert.deepEqual(state.media.filter((item) => item.post_id === postId).map((item) => item.cloudinary_public_id), [
    'asset/first', 'asset/third',
  ]);
});

test('removing one image queues only its unreferenced asset', async () => {
  const { repository, state } = createRepository([
    initialMedia(firstUrl, 'asset/first', 0),
    initialMedia(secondUrl, 'asset/second', 1),
  ]);
  await repository.update(postId, ownerId, { media: [media(secondUrl)] });
  assert.deepEqual([...state.cleanup], ['asset/first']);
  assert.deepEqual([...state.unresolved], []);
});

test('retired assets remain when another post references the same public ID', async () => {
  const { repository, state } = createRepository([
    initialMedia(firstUrl, 'asset/shared'),
    initialMedia(secondUrl, 'asset/kept', 1),
    initialMedia(firstUrl, 'asset/shared', 0, otherPostId),
  ]);
  await repository.update(postId, ownerId, { media: [media(secondUrl)] });
  assert.equal(state.cleanup.has('asset/shared'), false);
});

test('retired assets remain when another post references the same URL without a public ID', async () => {
  const { repository, state } = createRepository([
    initialMedia(firstUrl, 'asset/shared'),
    initialMedia(secondUrl, 'asset/kept', 1),
    { ...initialMedia(firstUrl, 'unused', 0, otherPostId), cloudinary_public_id: null },
  ]);
  await repository.update(postId, ownerId, { media: [media(secondUrl)] });
  assert.equal(state.cleanup.has('asset/shared'), false);
  assert.equal(state.unresolved.has(firstUrl), false);
});

test('untracked legacy media is queued for manual cleanup only when unreferenced', async () => {
  const { repository, state } = createRepository([
    { ...initialMedia(firstUrl, 'unused'), cloudinary_public_id: null },
    initialMedia(secondUrl, 'asset/kept', 1),
  ]);
  await repository.update(postId, ownerId, { media: [media(secondUrl)] });
  assert.deepEqual([...state.unresolved], [firstUrl]);
  assert.deepEqual([...state.cleanup], []);
});

test('permanent deletion protects assets shared by public ID or by URL without an ID', async () => {
  for (const shared of [
    initialMedia(firstUrl, 'asset/shared', 0, otherPostId),
    { ...initialMedia(firstUrl, 'unused', 0, otherPostId), cloudinary_public_id: null },
  ]) {
    const fixture = createRepository([initialMedia(firstUrl, 'asset/shared'), shared]);
    const result = await fixture.repository.delete(postId, ownerId);
    assert.equal(result.deleted, true);
    assert.deepEqual(result.cleanupPublicIds, []);
    assert.equal(fixture.state.cleanup.has('asset/shared'), false);
  }
});

test('permanent deletion queues an unshared tracked asset transactionally', async () => {
  const fixture = createRepository([initialMedia(firstUrl, 'asset/unshared')]);
  const result = await fixture.repository.delete(postId, ownerId);
  assert.equal(result.deleted, true);
  assert.deepEqual(result.cleanupPublicIds, ['asset/unshared']);
  assert.deepEqual([...fixture.state.cleanup], ['asset/unshared']);
});

test('media update failure rolls back replacement rows and queued cleanup', async () => {
  const existing = initialMedia(firstUrl, 'asset/first');
  const { repository, state } = createRepository([existing], { failMediaInsert: true });
  await assert.rejects(repository.update(postId, ownerId, { media: [media(secondUrl, 'asset/second')] }));
  assert.equal(state.rolledBack, true);
  assert.deepEqual(state.media, [existing]);
  assert.deepEqual([...state.cleanup], []);
});

test('new upload ownership is rechecked while its media advisory locks are held', async () => {
  const fixture = createRepository([initialMedia(firstUrl, 'asset/first')]);
  let verifiedAfterLock = false;
  await assert.rejects(
    fixture.repository.update(postId, ownerId, { media: [media(secondUrl, 'asset/second')] }, async () => {
      verifiedAfterLock = fixture.lockCount > 0;
      return false;
    }),
    /invalid or no longer belongs/,
  );
  assert.equal(verifiedAfterLock, true);
  assert.equal(fixture.state.rolledBack, true);
  assert.deepEqual(fixture.state.media.map((item) => item.media_url), [firstUrl]);
});

function cleanupFixture(count: number) {
  const pending = Array.from({ length: count }, (_, index) => `asset/${index}`);
  const attempts: string[] = [];
  const failed: string[] = [];
  const repository = {
    async listPendingMediaCleanup(limit: number) { return pending.slice(0, limit); },
    async listUnresolvedMediaCleanup() { return []; },
    async completeMediaCleanup(id: string) {
      attempts.push(id);
      const index = pending.indexOf(id);
      if (index >= 0) pending.splice(index, 1);
    },
    async recordMediaCleanupFailure(id: string) { failed.push(id); },
  };
  return { repository, pending, attempts, failed };
}

test('cleanup processes a bounded batch and reports additional queued assets', async () => {
  const fixture = cleanupFixture(105);
  const result = await runCloudinaryCleanupBatch(fixture.repository, { async deleteAsset() {} });
  assert.equal(result.attempted, 100);
  assert.equal(result.batchSucceeded, true);
  assert.equal(result.moreQueued, true);
  assert.equal(result.fullyDrained, false);
  assert.equal(fixture.pending.length, 5);
});

test('cleanup does not report completion when an item fails or legacy work remains', async () => {
  const fixture = cleanupFixture(1);
  let unresolved = ['https://res.cloudinary.com/test/legacy.jpg'];
  fixture.repository.listUnresolvedMediaCleanup = async (limit = 100) => unresolved.slice(0, limit);
  const result = await runCloudinaryCleanupBatch(fixture.repository, {
    async deleteAsset() { throw new Error('provider unavailable'); },
  });
  assert.equal(result.failed, 1);
  assert.equal(result.batchSucceeded, false);
  assert.equal(result.moreQueued, true);
  assert.equal(result.fullyDrained, false);
  assert.deepEqual(fixture.failed, ['asset/0']);

  unresolved = [];
  fixture.pending.length = 0;
  const drained = await runCloudinaryCleanupBatch(fixture.repository, { async deleteAsset() {} });
  assert.equal(drained.fullyDrained, true);
});
