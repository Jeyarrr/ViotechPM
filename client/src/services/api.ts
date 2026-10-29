import type { ApiEnvelope } from '@/types/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}
const baseUrl = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Unable to connect. Check your connection and try again.',
    );
  }
  const json = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      json?.error?.code ?? 'REQUEST_FAILED',
      json?.error?.message ?? 'The service is unavailable. Please try again.',
      json?.error?.fields ?? [],
    );
  return (json as ApiEnvelope<T>).data;
}
export const api = {
  async upload(path: string, file: File, onProgress: (percent: number) => void) {
    const { csrfToken } = await request<{ csrfToken: string }>('/auth/csrf');
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${baseUrl}/api${path}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error('Upload failed. Check your connection and try again.'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        try {
          reject(new Error(JSON.parse(xhr.responseText).error?.message ?? 'Upload failed.'));
        } catch {
          reject(new Error('Upload failed. Check the file size and type.'));
        }
      };
      xhr.send(file);
    });
  },
  async download(path: string, filename: string) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api${path}`, { credentials: 'include' });
    } catch {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'Unable to download. Check your connection and try again.',
      );
    }
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        json?.error?.code ?? 'DOWNLOAD_FAILED',
        json?.error?.message ?? 'Unable to download this report.',
      );
    }
    const url = URL.createObjectURL(await response.blob()),
      link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  get: <T>(path: string) => request<T>(path),
  patch: <T>(path: string, body: unknown) => mutate<T>('PATCH', path, body),
  delete: <T>(path: string, body: unknown = {}) => mutate<T>('DELETE', path, body),
  async post<T>(path: string, body: unknown = {}): Promise<T> {
    // Fetch the current synchronizer token for each write, including after session rotation.
    const { csrfToken } = await request<{ csrfToken: string }>('/auth/csrf');
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'X-CSRF-Token': csrfToken },
    });
  },
};

async function mutate<T>(method: string, path: string, body: unknown): Promise<T> {
  const { csrfToken } = await request<{ csrfToken: string }>('/auth/csrf');
  return request<T>(path, {
    method,
    body: JSON.stringify(body),
    headers: { 'X-CSRF-Token': csrfToken },
  });
}
