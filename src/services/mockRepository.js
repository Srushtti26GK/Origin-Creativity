/*
 * Mock post storage for the unconfigured demo mode.
 * API-backed social interactions are handled by backend services and never use these records.
 */
import { mockPosts } from '../data/mockPosts.js';

const KEYS = { posts: 'origin:posts:v1' };
const memory = {}; // keeps the session consistent even if localStorage is unavailable

function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? null : JSON.parse(raw);
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback; // missing, malformed or blocked storage
  }
}

function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode: the in-memory copy still works for this session */
  }
}

const load = (key, seed) => (memory[key] ??= readStored(key, seed));
const save = (key, value, toStored = (v) => v) => { memory[key] = value; writeStored(key, toStored(value)); };

// Local image previews (blob: URLs) die with the tab, so they are never persisted.
const withoutBlobUrls = (posts) =>
  posts.map((p) => (p.media?.url?.startsWith('blob:') ? { ...p, media: { ...p.media, url: '' } } : p));

export const loadPosts = () => load(KEYS.posts, mockPosts);
export const savePosts = (posts) => save(KEYS.posts, posts, withoutBlobUrls);
export const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
