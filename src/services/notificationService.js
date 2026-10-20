import { apiRequest } from './apiClient.js';
import { getCsrfToken } from './authService.js';

export async function getNotificationsPage(page = 1, limit = 20) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiRequest(`/api/notifications?${query}`);
}

export async function markNotificationRead(notificationId) {
  const { csrfToken } = await getCsrfToken();
  return apiRequest(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}

export async function markAllNotificationsRead() {
  const { csrfToken } = await getCsrfToken();
  return apiRequest('/api/notifications/read-all', {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
