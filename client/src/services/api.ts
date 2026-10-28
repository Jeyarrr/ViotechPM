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
