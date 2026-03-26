import { createClient } from '@supabase/supabase-js';
import { setAuth } from '../auth';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? 'http://localhost:3001';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- DOM refs ---
const authSection = document.getElementById('auth-section') as HTMLElement;
const petSection = document.getElementById('pet-section') as HTMLElement;
const emailInput = document.getElementById('email') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const authBtn = document.getElementById('auth-btn') as HTMLButtonElement;
const toggleBtn = document.getElementById('toggle-btn') as HTMLButtonElement;
const toggleLabel = document.getElementById('toggle-label') as HTMLElement;
const errorMsg = document.getElementById('error-msg') as HTMLElement;
const petNameInput = document.getElementById('pet-name') as HTMLInputElement;
const soulPromptInput = document.getElementById('soul-prompt') as HTMLTextAreaElement;
const createBtn = document.getElementById('create-btn') as HTMLButtonElement;
const errorMsgPet = document.getElementById('error-msg-pet') as HTMLElement;
const colorCustomInput = document.getElementById('color-custom') as HTMLInputElement;
const swatches = document.querySelectorAll<HTMLElement>('.swatch');

// --- Color picker logic ---
let selectedColor = '#ffffff';

function selectColor(color: string): void {
  selectedColor = color;
  colorCustomInput.value = color;
  swatches.forEach((s) => {
    s.classList.toggle('selected', s.dataset['color'] === color);
  });
}

swatches.forEach((swatch) => {
  swatch.addEventListener('click', () => {
    const color = swatch.dataset['color'] ?? '#ffffff';
    selectColor(color);
  });
});

colorCustomInput.addEventListener('input', () => {
  selectedColor = colorCustomInput.value;
  swatches.forEach((s) => s.classList.remove('selected'));
});

let isSignUp = false;
let accessToken = '';

// --- Auth toggle ---
toggleBtn.addEventListener('click', () => {
  isSignUp = !isSignUp;
  authBtn.textContent = isSignUp ? 'Sign Up' : 'Sign In';
  toggleLabel.textContent = isSignUp ? 'Have an account?' : 'No account?';
  toggleBtn.textContent = isSignUp ? 'Sign In' : 'Sign Up';
  errorMsg.textContent = '';
});

// --- Auth submit ---
authBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  errorMsg.textContent = '';

  if (!email || !password) {
    errorMsg.textContent = 'Email and password required.';
    return;
  }

  authBtn.disabled = true;

  try {
    const { data, error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      errorMsg.textContent = error.message;
      return;
    }

    accessToken = data.session?.access_token ?? '';
    if (!accessToken) {
      errorMsg.textContent = 'Auth succeeded but no session token returned.';
      return;
    }

    // Check for existing pets — skip creation form if already has one
    const petsRes = await fetch(`${BACKEND_URL}/api/pets`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (petsRes.ok) {
      const pets = await petsRes.json() as Array<{ id: string }>;
      if (pets.length > 0) {
        setAuth(accessToken, pets[0].id);
        window.location.replace('/');
        return;
      }
    }

    // No pets yet — show creation form
    authSection.style.display = 'none';
    petSection.style.display = 'block';
  } finally {
    authBtn.disabled = false;
  }
});

// --- Pet creation ---
createBtn.addEventListener('click', async () => {
  const name = petNameInput.value.trim();
  const soul_prompt = soulPromptInput.value.trim();
  errorMsgPet.textContent = '';

  if (!name) {
    errorMsgPet.textContent = 'Pet name is required.';
    return;
  }
  if (!soul_prompt) {
    errorMsgPet.textContent = 'Soul prompt is required.';
    return;
  }

  createBtn.disabled = true;

  try {
    const res = await fetch(`${BACKEND_URL}/api/pets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ name, soul_prompt, tint_color: selectedColor }),
    });

    const data = await res.json().catch(() => ({})) as { id?: string; error?: string };
    if (!res.ok) {
      errorMsgPet.textContent = data.error ?? `Request failed: ${res.status}`;
      return;
    }

    // Persist auth and redirect to the canvas
    setAuth(accessToken, data.id ?? '');
    window.location.replace('/');
  } catch (err) {
    errorMsgPet.textContent = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    createBtn.disabled = false;
  }
});
