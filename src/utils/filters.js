
import { getCategoryLabel } from '../data/categories.js';

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'popular', label: 'Most appreciated' },
  { id: 'discussed', label: 'Most discussed' },
];

const normalize = (value) =>
  String(value ?? '').trim().toLowerCase();

const getCreator = (creatorsById, creatorId) => {
  if (!creatorsById || creatorId == null) return undefined;

  if (typeof creatorsById.get === 'function') {
    return creatorsById.get(creatorId) ??
      creatorsById.get(String(creatorId));
  }

  return creatorsById[creatorId] ??
    creatorsById[String(creatorId)];
};

export function filterPosts(
  posts = [],
  { query = '', category = 'all', sort = 'newest' } = {},
  { creatorsById, commentCounts } = {},
) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);

  const matches = (post) => {
    if (!post) return false;

    const postCategory = normalize(post.category);
    const selectedCategory = normalize(category);

    if (
      selectedCategory &&
      selectedCategory !== 'all' &&
      postCategory !== selectedCategory
    ) {
      return false;
    }

    if (!terms.length) return true;

    const creator = getCreator(creatorsById, post.creatorId);
    const tags = Array.isArray(post.tags)
      ? post.tags
      : typeof post.tags === 'string'
        ? [post.tags]
        : [];

    let categoryLabel = '';

    try {
      categoryLabel = getCategoryLabel(post.category) ?? '';
    } catch {
      categoryLabel = '';
    }

    const searchableFields = [
      post.title,
      post.description,
      post.category,
      categoryLabel,
      creator?.name,
      creator?.displayName,
      creator?.username,
      creator?.handle,
      ...tags,
    ];

    const haystack = searchableFields
      .map(normalize)
      .filter(Boolean)
      .join(' ');

    return terms.every((term) => haystack.includes(term));
  };

  const safePosts = Array.isArray(posts) ? posts : [];

  const getCount = (counts, id) => {
    if (!counts || id == null) return 0;

    const value = typeof counts.get === 'function'
      ? counts.get(id) ?? counts.get(String(id))
      : counts[id] ?? counts[String(id)];

    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
  };

  const getTimestamp = (post) => {
    const timestamp = new Date(
      post.repostedBy?.createdAt ?? post.createdAt ?? 0,
    ).getTime();

    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const comparators = {
    newest: (a, b) => getTimestamp(b) - getTimestamp(a),
    popular: (a, b) =>
      getCount(null, null) +
      (Number(b.likesCount) || 0) -
      (Number(a.likesCount) || 0),
    discussed: (a, b) =>
      getCount(commentCounts, b.id) - getCount(commentCounts, a.id),
  };

  return safePosts
    .filter(matches)
    .sort(comparators[sort] ?? comparators.newest);
}
