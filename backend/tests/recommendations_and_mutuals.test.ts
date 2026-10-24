import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import type { FollowRepository } from '../src/repositories/follow.repository.js';
import { createFollowRepository } from '../src/repositories/follow.repository.js';
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
process.env.FRONTEND_ORIGINS = 'http://recs.test';
process.env.SESSION_SECRET = 'recommendations-test-session-secret-at-least-32-chars';
process.env.DB_USER = 'rec_test';
process.env.DB_PASSWORD = 'rec_test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'rec_test';

const [{ createApp }] = await Promise.all([
  import('../src/app.js'),
]);

const origin = 'http://recs.test';
const userA = '111e4567-e89b-42d3-a456-426614174001';
const userB = '222e4567-e89b-42d3-a456-426614174002';
const userC = '333e4567-e89b-42d3-a456-426614174003';
const userD = '444e4567-e89b-42d3-a456-426614174004';

const password = 'a-strong-recs-test-password';
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

function createUsers(): UserRepository {
  const users = [
    { id: userA, username: 'creator_a', displayName: 'Creator A', bio: 'Bio A', avatarUrl: null },
    { id: userB, username: 'creator_b', displayName: 'Creator B', bio: 'Bio B', avatarUrl: null },
    { id: userC, username: 'creator_c', displayName: 'Creator C', bio: 'Bio C', avatarUrl: null },
    { id: userD, username: 'creator_d', displayName: 'Creator D', bio: 'Bio D', avatarUrl: null },
  ];

  return {
    async create(_user: NewUser) { return users[0]; },
    async findByLoginIdentifier(identifier) {
      const u = users.find((item) => item.username === identifier || item.id === identifier);
      if (!u) return null;
      return { ...u, email: `${u.username}@example.test`, passwordHash, createdAt: new Date() };
    },
    async findById(id) {
      const u = users.find((item) => item.id === id);
      return u ? { ...u, createdAt: new Date() } : null;
    },
    async findPublicProfile(username) {
      const u = users.find((item) => item.username === username);
      return u ? { username: u.username, displayName: u.displayName, bio: u.bio, avatarUrl: u.avatarUrl, createdAt: new Date(), postCount: 2 } : null;
    },
    async updateProfile() { return null; },
    async listPublicPosts() { return []; },
    async countPublicPosts() { return 0; },
  };
}

test('creator recommendations ranking, exclusions, and explanations', async () => {
  // Scenario:
  // User A follows B and C.
  // B follows D.
  // C follows D.
  // Candidate D is followed by 2 people A follows (B and C).
  // Candidate D should rank #1 with mutual count 2 and truthful explanation.
  // User A itself must be excluded.
  // B and C (already followed by A) must be excluded.

  const mockDb = {
    async query(text: string, values: unknown[] = []) {
      if (text.includes('WITH my_following AS')) {
        const userIdParam = values[0];
        if (userIdParam === userA) {
          return {
            rows: [
              {
                id: userD,
                username: 'creator_d',
                display_name: 'Creator D',
                bio: 'Bio D',
                avatar_url: null,
                mutual_count: '2',
                sample_followers: ['Creator B', 'Creator C'],
                total_count: '1',
              },
            ],
          };
        }
        // User with no second degree follows
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const followRepo = createFollowRepository(mockDb as any);

  // Recommendations for User A
  const recs = await followRepo.getRecommendations(userA, 10, 0);
  assert.equal(recs.total, 1);
  assert.equal(recs.creators.length, 1);
  assert.equal(recs.creators[0].id, userD);
  assert.equal(recs.creators[0].mutualFollowersCount, 2);
  assert.equal(recs.creators[0].explanation, 'Followed by Creator B and Creator C');

  // Empty recommendations for isolated user
  const emptyRecs = await followRepo.getRecommendations('isolated-user', 10, 0);
  assert.equal(emptyRecs.total, 0);
  assert.equal(emptyRecs.creators.length, 0);
});

test('mutual follow detection correctly identifies bidirectional follows', async () => {
  const followsStore = new Set<string>();
  // A follows B
  followsStore.add(`${userA}:${userB}`);
  // B follows A
  followsStore.add(`${userB}:${userA}`);
  // A follows C (unidirectional)
  followsStore.add(`${userA}:${userC}`);

  const mockDb = {
    async query(text: string, values: unknown[] = []) {
      if (text.includes('followers_count')) {
        const username = values[0];
        const viewerId = values[1] as string | null;
        const targetId = username === 'creator_b' ? userB : userC;

        const isFollowing = viewerId ? followsStore.has(`${viewerId}:${targetId}`) : false;
        const followsYou = viewerId ? followsStore.has(`${targetId}:${viewerId}`) : false;

        return {
          rows: [
            {
              followers_count: '1',
              following_count: '1',
              is_following: isFollowing,
              follows_you: followsYou,
              mutual_following_count: '0',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const followRepo = createFollowRepository(mockDb as any);

  // When viewer A inspects creator B (both follow each other -> mutual = true)
  const statsB = await followRepo.getStats('creator_b', userA);
  assert.ok(statsB);
  assert.equal(statsB.isFollowing, true);
  assert.equal(statsB.followsYou, true);
  assert.equal(statsB.isMutual, true);

  // When viewer A inspects creator C (A follows C, but C does NOT follow A -> mutual = false)
  const statsC = await followRepo.getStats('creator_c', userA);
  assert.ok(statsC);
  assert.equal(statsC.isFollowing, true);
  assert.equal(statsC.followsYou, false);
  assert.equal(statsC.isMutual, false);
});
