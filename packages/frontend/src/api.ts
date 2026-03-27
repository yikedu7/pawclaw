import { clearAuth } from './auth';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3001';

export { BACKEND_URL };

/**
 * Fetch wrapper for authenticated API calls.
 * On 401: clears stored auth and redirects to /create.html?reason=expired.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BACKEND_URL}${path}`, init);
  if (res.status === 401) {
    clearAuth();
    window.location.replace('/create.html?reason=expired');
    // Pending promise — page is redirecting
    return new Promise(() => {});
  }
  return res;
}
