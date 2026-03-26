const AUTH_KEY = 'pawclaw_auth';

interface AuthState {
  token: string;
  pet_id: string;
}

export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed.token || !parsed.pet_id) return null;
    return { token: parsed.token, pet_id: parsed.pet_id };
  } catch {
    return null;
  }
}

export function setAuth(token: string, pet_id: string): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, pet_id }));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}
