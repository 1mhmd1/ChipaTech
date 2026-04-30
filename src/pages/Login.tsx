import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { Field, Input } from '../components/ui/Field';
import { impersonate, loginAsync, sendPasswordReset } from '../lib/auth/session';
import { isSupabaseEnabled } from '../lib/supabase/client';
import { Modal } from '../components/ui/Modal';

export function LoginPage() {
  const { user, setUser } = useAppStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState(
    isSupabaseEnabled() ? '' : 'rabih@chipafarm.com',
  );
  const [password, setPassword] = useState(isSupabaseEnabled() ? '' : 'demo');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotState, setForgotState] = useState<
    'idle' | 'sending' | 'sent' | 'error'
  >('idle');
  const [forgotMsg, setForgotMsg] = useState<string>();

  if (user) {
    return <Navigate to={user.role === 'partner' ? '/partner' : '/'} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSubmitting(true);
    try {
      const u = await loginAsync(email.trim(), password);
      if (!u) {
        setError('Invalid credentials or inactive account.');
        return;
      }
      setUser(u);
      navigate(u.role === 'partner' ? '/partner' : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message ?? 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickLogin = (id: string) => {
    const u = impersonate(id);
    if (!u) {
      setError(
        'Quick-login is disabled in Supabase mode. Sign in with your email & password.',
      );
      return;
    }
    setUser(u);
    navigate(u.role === 'partner' ? '/partner' : '/', { replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(440px,540px)] relative overflow-hidden">
      {/* Left — visual hero */}
      <section className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden">
        {/* Layered gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900" />
        <div
          className="absolute inset-0 opacity-60 pointer-events-none"
          style={{
            background:
              'radial-gradient(800px 500px at 80% 20%, rgba(46,144,255,0.35), transparent 60%), radial-gradient(700px 400px at 10% 90%, rgba(170,59,255,0.22), transparent 60%)',
          }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm font-bold ring-1 ring-white/20 shadow-lg">
            T
          </div>
          <div className="leading-tight">
            <div className="text-base font-semibold">TradeMirror OS</div>
            <div className="text-[11px] uppercase tracking-[0.12em] text-white/60">
              Chipa Farm — Internal
            </div>
          </div>
        </div>

        <div className="relative max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm px-3 py-1 text-[11px] font-medium ring-1 ring-white/15 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse" />
            Phase 1 — Live for triangular trades
          </div>
          <p className="text-[42px] leading-[1.05] font-semibold tracking-[-0.025em]">
            Mirror supplier contracts.
            <br />
            <span className="serif italic font-normal text-brand-200/95">
              Track every trade.
            </span>
          </p>
          <p className="mt-5 text-white/70 text-[15px] leading-relaxed">
            Upload a Frigorífico Concepción contract, generate a pixel-perfect
            mirrored sales contract under your entity, and run the full trade
            lifecycle — from advance to balance — in one place.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3 max-w-md">
            {[
              { v: 'Pixel-perfect', l: 'PDF mirroring' },
              { v: 'Real-time', l: 'Trade ledger' },
              { v: 'T+7', l: 'Milestone alerts' },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-lg bg-white/5 backdrop-blur-sm ring-1 ring-white/10 px-3 py-2.5"
              >
                <div className="text-[15px] font-semibold text-white">
                  {s.v}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/50 mt-0.5">
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between text-[11px] text-white/50">
          <span>Built on Supabase · pdf-lib · Resend</span>
          <span>v2.0</span>
        </div>
      </section>

      {/* Right — form panel */}
      <section className="flex items-center justify-center p-8 bg-white relative">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-900 text-white font-bold">
              T
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink-900">TradeMirror OS</div>
              <div className="text-[10px] uppercase tracking-wider text-ink-400">
                Chipa Farm
              </div>
            </div>
          </div>

          <h1 className="display-1">Welcome back</h1>
          <p className="text-sm text-ink-500 mt-1.5">
            Sign in with your Chipa Farm account.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </Field>
            <Field label="Password" required>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <div className="rounded-lg bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotState('idle');
                  setForgotMsg(undefined);
                  setForgotOpen(true);
                }}
                className="text-xs text-ink-500 hover:text-ink-900 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </form>

          {!isSupabaseEnabled() && (
            <div className="mt-8 pt-6 border-t border-ink-100">
              <div className="text-xs uppercase tracking-wider text-ink-400 mb-2">
                Quick demo access
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => quickLogin('user_owner')}
                  className="btn-secondary w-full justify-between"
                >
                  <span>Super Admin</span>
                  <span className="text-xs text-ink-400">
                    rabih@chipafarm.com
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => quickLogin('user_team')}
                  className="btn-secondary w-full justify-between"
                >
                  <span>Internal Team</span>
                  <span className="text-xs text-ink-400">team@chipafarm.com</span>
                </button>
                <button
                  type="button"
                  onClick={() => quickLogin('user_partner')}
                  className="btn-secondary w-full justify-between"
                >
                  <span>Partner (Read-only)</span>
                  <span className="text-xs text-ink-400">
                    partner@chipafarm.com
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        title="Reset your password"
      >
        {forgotState === 'sent' ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success-50 text-success-700">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-ink-900">
              Check your email
            </h3>
            <p className="mt-1 text-sm text-ink-500">
              If an account exists for <strong>{forgotEmail}</strong>, we've
              sent a reset link. The link expires in 1 hour.
            </p>
            <button
              type="button"
              className="btn-secondary mt-5"
              onClick={() => setForgotOpen(false)}
            >
              Done
            </button>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setForgotState('sending');
              setForgotMsg(undefined);
              try {
                await sendPasswordReset(forgotEmail.trim());
                setForgotState('sent');
              } catch (err) {
                setForgotState('error');
                setForgotMsg(
                  (err as Error).message ?? 'Could not send reset email.',
                );
              }
            }}
          >
            <p className="text-sm text-ink-500 mb-4">
              Enter your email and we'll send a password-reset link.
              {!isSupabaseEnabled() && (
                <span className="block mt-1 text-xs text-warning-700">
                  Demo mode: this is a stub — wire your Supabase project to
                  send real emails.
                </span>
              )}
            </p>
            <Field label="Email" required>
              <Input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                autoFocus
              />
            </Field>
            {forgotState === 'error' && forgotMsg && (
              <div className="mt-3 rounded-lg bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
                {forgotMsg}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setForgotOpen(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={!forgotEmail || forgotState === 'sending'}
              >
                {forgotState === 'sending' ? 'Sending…' : 'Send reset link'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
