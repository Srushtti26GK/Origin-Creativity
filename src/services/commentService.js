import { API_BASE_URL } from './apiConfig.js';
import { apiRequest } from './apiClient.js';
import { getCsrfToken } from './authService.js';

function requireApi() {
  if (!API_BASE_URL) throw new Error('Configure VITE_API_BASE_URL to use comments.');
}

export async function getComments(postId) {
  requireApi();
  const result = await apiRequest(`/api/posts/${encodeURIComponent(postId)}/comments`);
  return { comments: result.comments, commentCount: result.commentCount };
}

export async function addComment({ postId, text }) {
  requireApi();
  const { csrfToken } = await getCsrfToken();
  return apiRequest(`/api/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ text }),
  });
}

export async function deleteComment(postId, commentId) {
  requireApi();
  const { csrfToken } = await getCsrfToken();
  return apiRequest(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
