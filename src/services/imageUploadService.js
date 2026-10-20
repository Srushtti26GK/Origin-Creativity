import { API_BASE_URL } from './apiConfig.js';
import { ApiError } from './apiClient.js';
import { getCsrfToken } from './authService.js';

export async function uploadImage(file, uploadId, onProgress = () => {}) {
  const { csrfToken } = await getCsrfToken();
  const form = new FormData();
  form.append('image', file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE_URL}/api/uploads/images`);
    request.withCredentials = true;
    request.setRequestHeader('X-CSRF-Token', csrfToken);
    request.setRequestHeader('Idempotency-Key', uploadId);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener('load', () => {
      let result;
      try {
        result = JSON.parse(request.responseText);
      } catch {
        reject(new Error('The upload service returned an invalid response.'));
        return;
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new ApiError(result.message ?? 'Image upload failed.', {
          status: request.status,
          data: result,
        }));
        return;
      }
      onProgress(100);
      resolve(result.asset);
    });
    request.addEventListener('error', () => reject(new Error('Could not reach the image upload service.')));
    request.addEventListener('abort', () => reject(new Error('Image upload was cancelled.')));
    request.send(form);
  });
}
