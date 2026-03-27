import { createClient } from '@supabase/supabase-js';

const AUTH_KEY = 'pawclaw_auth';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface AuthState {
  token: string;
  pet_id: string;
  refresh_token?: string;
}

export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (!parsed.token || !parsed.pet_id) return null;
    return { token: parsed.token, pet_id: parsed.pet_id, refresh_token: parsed.refresh_token };
  } catch {
    return null;
  }
}

export function setAuth(token: string, pet_id: string, refresh_token?: string): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ token, pet_id, refresh_token }));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

/**
 * Attempts to refresh the Supabase session using the stored refresh_token.
 * Updates localStorage with fresh tokens on success.
 * Returns the fresh access token, or null if refresh is not possible.
 */
export async function refreshSession(): Promise<string | null> {
  const auth = getAuth();
  if (!auth) return null;
  if (!auth.refresh_token) return auth.token;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.setSession({
      access_token: auth.token,
      refresh_token: auth.refresh_token,
    });
    if (error || !data.session) return null;

    setAuth(data.session.access_token, auth.pet_id, data.session.refresh_token);
    return data.session.access_token;
  } catch {
    return null;
  }
}
