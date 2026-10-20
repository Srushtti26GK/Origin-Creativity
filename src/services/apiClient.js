import { API_BASE_URL } from './apiConfig.js';

export class ApiError extends Error {
  constructor(message, { status, data }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function readResponse(response) {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('The API returned invalid JSON.');
    }
  }

  return text;
}

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    credentials: 'include',
    headers,
  });
  const data = await readResponse(response);

  if (!response.ok) {
    const message = data && typeof data === 'object' && typeof data.message === 'string'
      ? data.message
      : `The request failed with status ${response.status}.`;
    throw new ApiError(message, { status: response.status, data });
  }

  return data;
}
