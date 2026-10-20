import { apiRequest } from './apiClient.js';

export async function getCsrfToken() {
  return apiRequest('/api/auth/csrf');
}

export async function signupAccount(account, csrfToken) {
  return apiRequest('/api/auth/signup', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(account),
  });
}

export async function loginAccount(credentials, csrfToken) {
  return apiRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(credentials),
  });
}

export async function getAuthenticatedUser() {
  return apiRequest('/api/auth/me');
}

export async function logoutAccount(csrfToken) {
  return apiRequest('/api/auth/logout', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
