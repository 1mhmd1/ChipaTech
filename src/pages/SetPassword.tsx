// =============================================================
// SetPassword — single page that handles BOTH:
//   • First-time setup after a magic-link invite. Supabase
//     creates a session when the user clicks the invite link,
//     so we just need to let them choose their password.
//   • Password recovery from a "Forgot password?" email. The
//     recovery token in the URL hash is auto-processed by the
//     Supabase JS client and fires PASSWORD_RECOVERY.
//
// Either way: by the time the form is shown, the user has a
// valid session. We call supabase.auth.updateUser({ password })
// to set/change it, then send them on to their dashboard.
// =============================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { Field, Input } from '../components/ui/Field';
import { getSupabase, isSupabaseEnabled } from '../lib/supabase/client';
import { restoreSessionAsync } from '../lib/auth/session';
import { hydrateFromSupabase, resetHydration } from '../lib/supabase/repos';

export function SetPasswordPage() {
  const navigate = useNavigate();
  const setUser = useAppStore((s) => s.setUser);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [mode, setMode] = useState<'invite' | 'recovery' | 'unknown'>('unknown');

  useEffect(() => {
    if (!isSupabaseEnabled()) {
      // Demo mode — pretend the link is valid so the UI renders.
      setSessionReady(true);
      setMode('invite');
      return;
    }
    const sb = getSupabase();
    // Supabase auto-detects #access_token / #type=recovery in the URL
    // and creates a session. Inspect the hash to decide which
    // headline to show.
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) setMode('recovery');
    else if (hash.includes('type=invite') || hash.includes('type=signup'))
      setMode('invite');

    sb.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
      else
        setError(
          'This link is invalid or has expired. Request a fresh invite or reset email from the login page.',
        );
    });

    const { data: sub } = sb.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recovery');
        setSessionReady(true);
        setError(undefined);
      } else if (event === 'SIGNED_IN') {
        setSessionReady(true);
        setError(undefined);
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      if (isSupabaseEnabled()) {
        const sb = getSupabase();
        const { error: err } = await sb.auth.updateUser({ password });
        if (err) throw err;
        // Re-hydrate the cache against the now-fully-authenticated
        // session and pull the public.users profile.
        resetHydration();
        await hydrateFromSupabase();
      }
      const u = await restoreSessionAsync();
      setUser(u);
      // Strip the hash and send them to their dashboard
      window.history.replaceState({}, '', window.location.pathname);
      navigate(u?.role === 'partner' ? '/partner' : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message ?? 'Could not set password.');
    } finally {
      setSubmitting(false);
    }
  };

  const headline =
    mode === 'recovery'
      ? 'Reset your password'
      : mode === 'invite'
        ? 'Welcome — set your password'
        : 'Set your password';

  const subhead =
    mode === 'recovery'
      ? 'Choose a new password for your account.'
      : mode === 'invite'
        ? "You've been invited to TradeMirror OS. Pick a password to finish setting up your account."
        : 'Choose a password to continue.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-ink-50 via-white to-brand-50/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-ink-900 to-ink-700 text-white font-bold text-lg shadow-soft ring-1 ring-ink-900/10 mb-4">
            T
          </div>
          <h1 className="display-1">{headline}</h1>
          <p className="text-sm text-ink-500 mt-2">{subhead}</p>
        </div>

        <div className="card card-pad">
          {!sessionReady && !error ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-ink-200 border-t-ink-700" />
              <div className="text-sm text-ink-500">Verifying your link…</div>
            </div>
          ) : error && !sessionReady ? (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-danger-50 text-danger-700">
                !
              </div>
              <div className="text-sm font-semibold text-ink-900">
                Link not valid
              </div>
              <p className="mt-1 text-sm text-ink-500">{error}</p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="btn-secondary mt-5"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="New password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirm password" required>
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
              </Field>
              <div className="text-[11px] text-ink-500">
                Use at least 8 characters. Avoid passwords you've used elsewhere.
              </div>
              {error && (
                <div className="rounded-lg bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
                  {error}
                </div>
              )}
              <button
                type="submit"
                className="btn-primary w-full"
                disabled={submitting || !password || !confirm}
              >
                {submitting
                  ? 'Saving…'
                  : mode === 'recovery'
                    ? 'Reset password'
                    : 'Save password & continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
