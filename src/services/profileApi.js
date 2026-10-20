import { API_BASE_URL } from './apiConfig.js';
import { getAuthenticatedUser, getCsrfToken } from './authService.js';
import { apiRequest } from './apiClient.js';

export const profileApiEnabled = Boolean(API_BASE_URL);

export async function getPublicProfile(username) {
  return apiRequest(`/api/users/${encodeURIComponent(username)}`);
}

export async function getUserPosts(username, page = 1, limit = 12) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/users/${encodeURIComponent(username)}/posts?${query}`);
}

export const getCurrentUser = getAuthenticatedUser;
export { getCsrfToken };

export async function updateCurrentProfile(updates, csrfToken) {
  return apiRequest('/api/users/me', {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(updates),
  });
}

export async function getFollowStatus(username) {
  return apiRequest(`/api/users/${encodeURIComponent(username)}/follow-status`);
}

export async function getFollowList(username, direction, page = 1, limit = 20) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/users/${encodeURIComponent(username)}/${direction}?${query}`);
}

export async function followCreator(username) {
  const { csrfToken } = await getCsrfToken();
  return apiRequest(`/api/users/${encodeURIComponent(username)}/follow`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

export async function unfollowCreator(username) {
  const { csrfToken } = await getCsrfToken();
  return apiRequest(`/api/users/${encodeURIComponent(username)}/follow`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
