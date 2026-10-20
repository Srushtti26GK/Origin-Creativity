import { CURRENT_USER_ID } from '../data/mockCreators.js';
import { API_BASE_URL } from './apiConfig.js';
import { apiRequest } from './apiClient.js';
import { getCsrfToken } from './authService.js';
import {
  delay, newId, loadPosts, savePosts,
} from './mockRepository.js';

const EDITABLE_FIELDS = ['title', 'description', 'category', 'tags', 'inspirationNote'];
export const postsApiEnabled = Boolean(API_BASE_URL);

function normalizePost(post) {
  const media = Array.isArray(post.media) ? post.media : [];
  const firstImage = media.find((item) => item.type === 'image');
  return {
    ...post,
    likesCount: Number(post.likesCount ?? 0),
    commentsCount: Number(post.commentsCount ?? 0),
    repostsCount: Number(post.repostsCount ?? 0),
    likedByMe: Boolean(post.likedByMe),
    repostedByMe: Boolean(post.repostedByMe),
    mediaItems: media,
    media: firstImage ?? { type: 'image', url: '', alt: `Artwork titled “${post.title}”`, aspect: 'landscape' },
    authenticity: post.authenticity ?? {
      declaration: post.authenticityDeclaration ?? null,
      verificationStatus: post.verificationStatus ?? 'unverified',
    },
    creator: post.creator ? {
      ...post.creator,
      handle: post.creator.handle ?? post.creator.username,
    } : null,
  };
}

export async function getPostsPage(page = 1, limit = 12) {
  if (postsApiEnabled) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    const result = await apiRequest(`/api/posts?${query}`);
    return {
      posts: result.posts.map(normalizePost),
      pagination: result.pagination,
    };
  }
  await delay(450);
  const posts = loadPosts().map((post) => ({
    ...post,
    likesCount: null,
    commentsCount: null,
    repostsCount: null,
    likedByMe: false,
    repostedByMe: false,
    recentComments: [],
  }));
  return { posts, pagination: { page: 1, pageSize: posts.length, total: posts.length, totalPages: 1 } };
}

export async function getPosts() {
  return (await getPostsPage()).posts;
}

export async function getPostById(postId) {
  if (postsApiEnabled) {
    try {
      const result = await apiRequest(`/api/posts/${encodeURIComponent(postId)}`);
      return normalizePost(result.post);
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }
  await delay();
  const post = loadPosts().find((p) => p.id === postId);
  return post ? {
    ...post,
    likesCount: null,
    commentsCount: null,
    repostsCount: null,
    likedByMe: false,
    repostedByMe: false,
    recentComments: [],
  } : null;
}

export async function createPost(data) {
  if (postsApiEnabled) {
    const { csrfToken } = await getCsrfToken();
    const result = await apiRequest('/api/posts', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({
        title: data.title,
        description: data.description,
        category: data.category,
        tags: data.tags,
        workType: data.workType,
        sourcePostId: data.workType === 'inspired' ? data.sourcePostId : null,
        inspirationNote: data.workType === 'inspired' ? data.inspirationNote : null,
        media: (Array.isArray(data.media) ? data.media : data.media?.url ? [data.media] : [])
          .map((item) => ({
            type: item.type ?? 'image',
            url: item.url,
            alt: item.alt ?? null,
            aspect: item.aspect ?? null,
            ...(item.uploadId ? { uploadId: item.uploadId } : {}),
          })),
      }),
    });
    return normalizePost(result.post);
  }
  if (data.workType === 'inspired' || data.sourcePostId) {
    throw new Error('Configure VITE_API_BASE_URL to publish a recreated work with source attribution.');
  }
  await delay(300);
  const inspired = data.workType === 'inspired';
  const post = {
    id: newId('post'),
    title: data.title.trim(),
    description: data.description.trim(),
    creatorId: CURRENT_USER_ID,
    category: data.category,
    tags: data.tags,
    media: data.media,
    workType: data.workType,
    sourcePostId: inspired ? data.sourcePostId || null : null,
    inspirationNote: inspired ? data.inspirationNote?.trim() || null : null,
    authenticity: { declaration: inspired ? 'inspired' : 'original', verificationStatus: 'unverified' },
    likesCount: null,
    commentsCount: null,
    repostsCount: null,
    likedByMe: false,
    repostedByMe: false,
    createdAt: new Date().toISOString(),
  };
  savePosts([post, ...loadPosts()]);
  return post;
}

export async function updatePost(postId, changes) {
  if (postsApiEnabled) {
    const { csrfToken } = await getCsrfToken();
    const result = await apiRequest(`/api/posts/${encodeURIComponent(postId)}`, {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(changes),
    });
    return normalizePost(result.post);
  }
  await delay();
  const posts = loadPosts();
  const existing = posts.find((p) => p.id === postId);
  if (!existing) throw new Error('This work no longer exists.');
  if (existing.creatorId !== CURRENT_USER_ID) throw new Error('You can only edit your own works.');
  const allowed = Object.fromEntries(EDITABLE_FIELDS.filter((f) => f in changes).map((f) => [f, changes[f]]));
  const updated = { ...existing, ...allowed };
  savePosts(posts.map((p) => (p.id === postId ? updated : p)));
  return updated;
}

export async function deletePost(postId) {
  if (postsApiEnabled) {
    const { csrfToken } = await getCsrfToken();
    await apiRequest(`/api/posts/${encodeURIComponent(postId)}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': csrfToken },
    });
    return;
  }
  await delay();
  const existing = loadPosts().find((p) => p.id === postId);
  if (!existing) throw new Error('This work no longer exists.');
  if (existing.creatorId !== CURRENT_USER_ID) throw new Error('You can only delete your own works.');
  savePosts(loadPosts().filter((p) => p.id !== postId));
}

export async function toggleLike(postId, likedByMe) {
  if (!postsApiEnabled) throw new Error('Configure VITE_API_BASE_URL to use likes.');
  const { csrfToken } = await getCsrfToken();
  const result = await apiRequest(`/api/posts/${encodeURIComponent(postId)}/like`, {
    method: likedByMe ? 'DELETE' : 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  return result;
}

export async function toggleRepost(postId, reposted) {
  if (!postsApiEnabled) throw new Error('Configure VITE_API_BASE_URL to use reposts.');
  const { csrfToken } = await getCsrfToken();
  return apiRequest(`/api/posts/${encodeURIComponent(postId)}/repost`, {
    method: reposted ? 'DELETE' : 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

export async function getInspiredWorks(sourcePostId) {
  if (postsApiEnabled) {
    const result = await apiRequest(`/api/posts/${encodeURIComponent(sourcePostId)}/inspired-works`);
    return result.posts.map(normalizePost);
  }
  throw new Error('Configure VITE_API_BASE_URL to load attributed works from the server.');
}
