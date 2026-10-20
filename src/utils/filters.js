import { getCategoryLabel } from '../data/categories.js';

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'popular', label: 'Most appreciated' },
  { id: 'discussed', label: 'Most discussed' },
];

export function filterPosts(posts, { query = '', category = 'all', sort = 'newest' }, { creatorsById, commentCounts }) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const matches = (post) => {
    if (category !== 'all' && post.category !== category) return false;
    if (!terms.length) return true;
    const creator = creatorsById.get(post.creatorId);
    const haystack = [post.title, post.description, post.category, getCategoryLabel(post.category), creator?.name, creator?.handle, ...post.tags]
      .join(' ').toLowerCase();
    return terms.every((term) => haystack.includes(term));
  };

  const comparators = {
    newest: (a, b) => new Date(b.repostedBy?.createdAt ?? b.createdAt) - new Date(a.repostedBy?.createdAt ?? a.createdAt),
    popular: (a, b) => b.likesCount - a.likesCount,
    discussed: (a, b) => (commentCounts[b.id] ?? 0) - (commentCounts[a.id] ?? 0),
  };

  return posts.filter(matches).sort(comparators[sort] ?? comparators.newest);
}
