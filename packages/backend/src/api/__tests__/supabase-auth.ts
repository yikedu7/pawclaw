/**
 * Helpers for obtaining real Supabase JWT tokens in integration tests.
 *
 * Uses the Supabase admin REST API so tokens are signed with the actual
 * ES256 key and can be verified by the real authHook (no mocking needed).
 *
 * The default SERVICE_ROLE_KEY below is the well-known local dev key used
 * by every `supabase start` installation.
 */

const DEFAULT_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
  '.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0' +
  '.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_PASSWORD = 'pawclaw-test-pw-123';

function getBaseUrl(): string {
  return process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
}

function getServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SERVICE_ROLE_KEY;
}

function adminHeaders(): Record<string, string> {
  const key = getServiceKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Creates a Supabase auth user (upsert: deletes first if exists), then
 * signs in with password to return a real ES256-signed JWT access token.
 */
export async function getTestToken(userId: string, email: string): Promise<string> {
  const baseUrl = getBaseUrl();
  const headers = adminHeaders();

  // Delete if already exists (idempotent setup)
  await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers });

  const create = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: userId, email, password: TEST_PASSWORD, email_confirm: true }),
  });
  if (!create.ok) {
    throw new Error(`Failed to create test user ${email}: ${await create.text()}`);
  }

  const signIn = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: getServiceKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  const body = (await signIn.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

/** Removes a test user created by getTestToken. */
export async function deleteTestUser(userId: string): Promise<void> {
  const baseUrl = getBaseUrl();
  await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
}
