import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createFollowRepository } from '../src/repositories/follow.repository.js';
import { createSocialRepository } from '../src/repositories/social.repository.js';

const actorId = '123e4567-e89b-42d3-a456-426614174000';
const recipientId = '123e4567-e89b-42d3-a456-426614174001';
const postId = '223e4567-e89b-42d3-a456-426614174000';

test('a new like creates its notification atomically and does not notify the post owner about self-likes', async () => {
  let statement = '';
  let values: unknown[] = [];
  const pool = {
    async query(text: string, parameters: unknown[] = []) {
      statement = text;
      values = parameters;
      return { rowCount: 1, rows: [{ post_id: postId }] };
    },
  };
  const social = createSocialRepository(pool);

  assert.equal(await social.changeLike(postId, actorId, true), 'changed');
  assert.match(statement, /INSERT INTO notifications/);
  assert.match(statement, /WHERE p\.user_id <> i\.user_id/);
  assert.deepEqual(values.slice(0, 2), [postId, actorId]);
  assert.equal(typeof values[2], 'string');
});

test('comment notifications are created in the same statement and exclude self-comments', async () => {
  let statement = '';
  const commentId = randomUUID();
  const pool = {
    async query(text: string) {
      statement = text;
      return {
        rowCount: 1,
        rows: [{
          id: commentId,
          post_id: postId,
          user_id: actorId,
          content: 'A thoughtful comment',
          created_at: new Date(),
          username: 'maker',
          display_name: 'Maker',
          avatar_url: null,
        }],
      };
    },
  };
  const social = createSocialRepository(pool);

  const comment = await social.createComment(postId, actorId, 'A thoughtful comment');
  assert.equal(comment?.id, commentId);
  assert.match(statement, /INSERT INTO notifications/);
  assert.match(statement, /WHERE p\.user_id <> i\.user_id/);
  assert.match(statement, /INSERT INTO comments/);
});

test('follow notifications are inserted only for a new follow and self-follow is rejected', async () => {
  const calls: string[] = [];
  const pool = {
    async query(text: string, values: unknown[] = []) {
      calls.push(text);
      if (text.startsWith('SELECT id FROM users')) {
        return { rowCount: 1, rows: [{ id: values[0] === 'self' ? actorId : recipientId }] };
      }
      assert.deepEqual(values.slice(0, 2), [actorId, recipientId]);
      return { rowCount: 1, rows: [{ followed_id: recipientId }] };
    },
  };
  const follows = createFollowRepository(pool);

  assert.equal(await follows.change(actorId, 'creator', true), 'changed');
  assert.match(calls[1], /INSERT INTO notifications/);
  assert.equal(await follows.change(actorId, 'self', true), 'self');
  assert.equal(calls.length, 3);
});
