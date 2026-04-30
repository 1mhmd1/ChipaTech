// =============================================================
// Account — logged-in user's personal settings.
// Right now it covers password change. Open to all roles
// (super_admin, internal, partner) since everyone needs to be
// able to change their own password.
// =============================================================
import { useState } from 'react';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { useAppStore } from '../store/appStore';
import {
  getSupabase,
  isSupabaseEnabled,
} from '../lib/supabase/client';

export function AccountPage() {
  const user = useAppStore((s) => s.user);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSuccess(false);
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
      if (!isSupabaseEnabled()) {
        // Demo mode — pretend we changed it.
        await new Promise((r) => setTimeout(r, 400));
      } else {
        const sb = getSupabase();
        const { error: err } = await sb.auth.updateUser({ password });
        if (err) throw err;
      }
      setPassword('');
      setConfirm('');
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message ?? 'Could not change password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Account"
        description="Manage your sign-in credentials"
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6 min-w-0">
            <Card>
              <h2 className="text-base font-semibold text-ink-900">
                Change password
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                After saving, your existing sessions on other devices will
                stay signed in. Sign out from there if you want to revoke them.
              </p>

              <form onSubmit={onSubmit} className="mt-5 space-y-4 max-w-md">
                <Field label="New password" required>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Confirm new password" required>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </Field>
                <div className="text-[11px] text-ink-500">
                  At least 8 characters. Don't reuse a password from another
                  service.
                </div>
                {error && (
                  <div className="rounded-lg bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg bg-success-50 border border-success-100 px-3 py-2 text-sm text-success-700">
                    Password updated. Use it the next time you sign in.
                  </div>
                )}
                <div>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting || !password || !confirm}
                  >
                    {submitting ? 'Saving…' : 'Update password'}
                  </button>
                </div>
              </form>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <h3 className="text-sm font-semibold text-ink-900">
                Signed in as
              </h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex items-start gap-3">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-500 font-semibold pt-0.5">
                    Name
                  </dt>
                  <dd className="text-ink-800">{user.full_name}</dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-500 font-semibold pt-0.5">
                    Email
                  </dt>
                  <dd className="text-ink-800 break-all">{user.email}</dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-ink-500 font-semibold pt-0.5">
                    Role
                  </dt>
                  <dd className="text-ink-800 capitalize">
                    {user.role.replace('_', ' ')}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] text-ink-500">
                Need to change your name or role? Ask a Super Admin to update
                it from the Users page.
              </p>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
