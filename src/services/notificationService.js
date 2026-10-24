import { apiRequest } from './apiClient.js';
import { API_BASE_URL } from './apiConfig.js';
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

/**
 * Subscribes to Server-Sent Events (SSE) for live notification delivery.
 * Automatically handles reconnection and cleanup.
 */
export function subscribeToNotificationEvents(onNotification, onError) {
  if (!API_BASE_URL || typeof EventSource === 'undefined') {
    return () => {};
  }

  const url = `${API_BASE_URL}/api/notifications/events`;
  const eventSource = new EventSource(url, { withCredentials: true });

  eventSource.addEventListener('notification', (event) => {
    try {
      const data = JSON.parse(event.data);
      onNotification?.(data);
    } catch {
      // Ignore parse issues
    }
  });

  if (onError) {
    eventSource.onerror = (err) => {
      onError(err);
    };
  }

  return () => {
    eventSource.close();
  };
}
