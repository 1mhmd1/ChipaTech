import { useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input, Select } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { nowIso, uid, usersDB } from '../lib/storage/db';
import { useAppStore } from '../store/appStore';
import { formatDateTime } from '../lib/format';
import type { User, UserRole } from '../types';
import { getSupabase, isSupabaseEnabled } from '../lib/supabase/client';

export function UsersPage() {
  const me = useAppStore((s) => s.user);
  const [version, setVersion] = useState(0);
  const users = useMemo(() => usersDB.list(), [version]);
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [draft, setDraft] = useState({
    email: '',
    full_name: '',
    role: 'internal' as UserRole,
  });

  const [inviteError, setInviteError] = useState<string>();
  const [inviting2, setInviting2] = useState(false);

  const invite = async () => {
    setInviteError(undefined);
    setInviting2(true);
    try {
      if (isSupabaseEnabled()) {
        // Real Supabase invitation: send a magic link. The trigger
        // in 0001_init.sql auto-creates public.users from the
        // raw_user_meta_data we attach here.
        const sb = getSupabase();
        const { error } = await sb.auth.signInWithOtp({
          email: draft.email,
          options: {
            shouldCreateUser: true,
            data: {
              full_name: draft.full_name,
              role: draft.role,
            },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });
        if (error) throw error;
      } else {
        // Demo mode: insert directly into the in-memory users table
        usersDB.insert({
          id: uid('user'),
          email: draft.email,
          full_name: draft.full_name,
          role: draft.role,
          is_active: true,
          invited_at: nowIso(),
          created_at: nowIso(),
        });
      }
      setInviting(false);
      setDraft({ email: '', full_name: '', role: 'internal' });
      setVersion((v) => v + 1);
      alert(
        isSupabaseEnabled()
          ? `Magic-link invitation sent to ${draft.email}. They'll be added to the team list once they accept.`
          : `Demo invitation created for ${draft.email}.`,
      );
    } catch (err) {
      setInviteError((err as Error).message ?? 'Could not send invitation.');
    } finally {
      setInviting2(false);
    }
  };

  const toggleActive = (u: User) => {
    if (u.id === me?.id) {
      alert('You cannot deactivate your own account.');
      return;
    }
    usersDB.update(u.id, { is_active: !u.is_active });
    setVersion((v) => v + 1);
  };

  const updateRole = (u: User, role: UserRole) => {
    if (u.id === me?.id && role !== 'super_admin') {
      alert('You cannot downgrade your own role.');
      return;
    }
    usersDB.update(u.id, { role });
    setVersion((v) => v + 1);
    setEditing(null);
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite team members and partners — assigned roles enforce access via RLS"
        actions={
          <button
            className="btn-primary"
            onClick={() => setInviting(true)}
          >
            Invite user
          </button>
        }
      />
      <PageBody>
        <Card pad={false}>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-500 border-b border-ink-100">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">User</th>
                <th className="text-left px-5 py-3 font-semibold">Role</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Last login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-ink-100 last:border-0 table-row-hover"
                >
                  <td className="px-5 py-3">
                    <div className="font-semibold text-ink-900">
                      {u.full_name}{' '}
                      {u.id === me?.id && (
                        <span className="text-xs text-ink-500">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-ink-500">{u.email}</div>
                  </td>
                  <td className="px-5 py-3">
                    <Badge
                      tone={
                        u.role === 'super_admin'
                          ? 'ink'
                          : u.role === 'partner'
                            ? 'warning'
                            : 'brand'
                      }
                    >
                      {u.role.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {u.is_active ? (
                      <Badge tone="success" dot>Active</Badge>
                    ) : (
                      <Badge tone="neutral">Inactive</Badge>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-500 text-xs">
                    {u.last_login_at ? formatDateTime(u.last_login_at) : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      className="btn-ghost"
                      onClick={() => setEditing(u)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => toggleActive(u)}
                    >
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Modal
          open={inviting}
          onClose={() => setInviting(false)}
          title="Invite user"
        >
          <div className="space-y-4">
            <Field label="Full name" required>
              <Input
                value={draft.full_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, full_name: e.target.value }))
                }
              />
            </Field>
            <Field label="Email" required>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
              />
            </Field>
            <Field label="Role">
              <Select
                value={draft.role}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    role: e.target.value as UserRole,
                  }))
                }
              >
                <option value="internal">Internal Team Member</option>
                <option value="partner">Partner (read-only)</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </Field>
            <p className="text-xs text-ink-500">
              {isSupabaseEnabled()
                ? 'A magic-link email is sent via Supabase Auth. The user signs in with the link, sets a password from the Supabase prompt, and lands in their role-appropriate dashboard.'
                : 'Demo mode: this creates a local user record only. Configure VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY for real email invitations.'}
            </p>
            {inviteError && (
              <div className="rounded-lg bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
                {inviteError}
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInviting(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={invite}
              className="btn-primary"
              disabled={!draft.email || !draft.full_name || inviting2}
            >
              {inviting2 ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </Modal>

        <Modal
          open={!!editing}
          onClose={() => setEditing(null)}
          title={editing ? `Edit ${editing.full_name}` : ''}
        >
          {editing && (
            <div className="space-y-4">
              <Field label="Role">
                <Select
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      role: e.target.value as UserRole,
                    })
                  }
                >
                  <option value="internal">Internal Team Member</option>
                  <option value="partner">Partner</option>
                  <option value="super_admin">Super Admin</option>
                </Select>
              </Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEditing(null)} className="btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => updateRole(editing, editing.role)}
                  className="btn-primary"
                >
                  Update role
                </button>
              </div>
            </div>
          )}
        </Modal>
      </PageBody>
    </>
  );
}
