// ============================================================
// Auth session — backed by either Supabase Auth (when env vars
// are present) or a mock localStorage session (demo mode).
// Public surface stays sync for the existing components; we
// expose `restoreSessionAsync()` for the app shell to call on
// startup so we hydrate from Supabase before rendering routes.
// ============================================================

import type { User, UserRole } from '../../types';
import { isSupabaseEnabled, getSupabase } from '../supabase/client';
import { usersDB } from '../storage/db';

const SESSION_KEY = 'tm_os.session';

// Mirror of the currently signed-in user (sync access from anywhere)
let currentUserCache: User | null = null;

// Subscribers — Zustand store calls this on mount so it can re-render
// when the session changes.
type Listener = (u: User | null) => void;
const listeners = new Set<Listener>();

function setCurrent(u: User | null) {
  currentUserCache = u;
  if (u) localStorage.setItem(SESSION_KEY, u.id);
  else localStorage.removeItem(SESSION_KEY);
  listeners.forEach((l) => l(u));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentUser(): User | null {
  if (currentUserCache) return currentUserCache;
  // Fallback to the persisted ID for demo mode
  const id = localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  return usersDB.byId(id) ?? null;
}

// =============================================================
// Demo / localStorage auth
// =============================================================

function localLogin(email: string, password: string): User | null {
  const user = usersDB.byEmail(email);
  if (!user || !user.is_active) return null;
  if (!password) return null;
  usersDB.update(user.id, { last_login_at: new Date().toISOString() });
  setCurrent(usersDB.byId(user.id) ?? null);
  return currentUserCache;
}

function localLogout() {
  setCurrent(null);
}

export function impersonate(userId: string): User | null {
  // Dev-only role switch — not exposed in Supabase mode.
  if (isSupabaseEnabled()) return null;
  const user = usersDB.byId(userId);
  if (!user) return null;
  setCurrent(user);
  return user;
}

// =============================================================
// Supabase auth
// =============================================================

async function supaLogin(
  email: string,
  password: string,
): Promise<User | null> {
  const sb = getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return null;
  // Pull the corresponding row from public.users (it's auto-provisioned by
  // the trigger in 0001_init.sql).
  const { data: profile } = await sb
    .from('users')
    .select('*')
    .eq('id', data.user.id)
    .single();
  if (!profile) return null;
  await sb
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', data.user.id);
  const user = profile as User;
  setCurrent(user);
  return user;
}

async function supaLogout() {
  try {
    await getSupabase().auth.signOut();
  } finally {
    setCurrent(null);
  }
}

export async function restoreSessionAsync(): Promise<User | null> {
  if (!isSupabaseEnabled()) {
    // Demo mode — restore from localStorage
    const id = localStorage.getItem(SESSION_KEY);
    if (id) {
      const u = usersDB.byId(id);
      if (u) setCurrent(u);
    }
    return currentUser();
  }
  // Supabase mode — read JWT, fetch profile
  try {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    if (!data.session?.user) return null;
    const { data: profile } = await sb
      .from('users')
      .select('*')
      .eq('id', data.session.user.id)
      .single();
    if (profile) {
      setCurrent(profile as User);
      return profile as User;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth] restoreSessionAsync failed', err);
  }
  return null;
}

// =============================================================
// Sync facade used by the existing UI
// =============================================================

export function login(email: string, password: string): User | null {
  if (isSupabaseEnabled()) {
    // We can't await synchronously — fire the Supabase flow and
    // signal via the listener system. The Login page handles that.
    void supaLogin(email, password);
    return null;
  }
  return localLogin(email, password);
}

// Async variant — preferred for new code (Login page can await it
// and report errors)
export async function loginAsync(
  email: string,
  password: string,
): Promise<User | null> {
  if (isSupabaseEnabled()) return supaLogin(email, password);
  return localLogin(email, password);
}

export function logout() {
  if (isSupabaseEnabled()) {
    void supaLogout();
  } else {
    localLogout();
  }
}

/**
 * Trigger a password-reset email via Supabase Auth (which uses the
 * project's configured email provider — Resend in our setup). In demo
 * mode this resolves immediately so the UI can keep its happy path.
 *
 * The redirect points the recovery email back to /login; the Supabase
 * recovery flow includes a tokenized URL that handles the actual reset.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!isSupabaseEnabled()) {
    // Demo mode: pretend we sent it. No password to reset anyway.
    await new Promise((r) => setTimeout(r, 400));
    return;
  }
  const sb = getSupabase();
  const redirectTo = `${window.location.origin}/login?reset=1`;
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Helpers for role checks (kept for callers that may want them)
export function hasRole(user: User | null, ...roles: UserRole[]) {
  return Boolean(user && roles.includes(user.role));
}
