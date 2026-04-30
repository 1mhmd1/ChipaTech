import { useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { contactsDB, nowIso, uid } from '../lib/storage/db';
import { Badge } from '../components/ui/Badge';
import type { Contact } from '../types';

const empty = (): Omit<Contact, 'id' | 'created_at'> => ({
  full_name: '',
  phone: '',
  email: '',
  role: '',
  is_default: false,
});

export function ContactsPage() {
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [draft, setDraft] = useState(empty());

  const contacts = useMemo(() => contactsDB.list(), [version]);

  const onSave = () => {
    if (draft.is_default) {
      // ensure single default
      contactsDB.list().forEach((c) =>
        contactsDB.update(c.id, { is_default: false }),
      );
    }
    if (editing) {
      contactsDB.update(editing.id, draft);
    } else {
      contactsDB.insert({
        ...draft,
        id: uid('ct'),
        created_at: nowIso(),
      });
    }
    setEditing(null);
    setCreating(false);
    setDraft(empty());
    setVersion((v) => v + 1);
  };

  return (
    <>
      <PageHeader
        title="Contact Library"
        description="Internal staff visible to clients on generated contracts"
        actions={
          <button
            className="btn-primary"
            onClick={() => {
              setCreating(true);
              setDraft(empty());
            }}
          >
            Add contact
          </button>
        }
      />
      <PageBody>
        <Card pad={false}>
          <ul className="divide-y divide-ink-100">
            {contacts.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-4 p-5 hover:bg-ink-50/60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-ink-700 font-semibold">
                  {c.full_name
                    .split(' ')
                    .map((p) => p[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-ink-900">
                      {c.full_name}
                    </div>
                    {c.is_default && <Badge tone="brand">Default</Badge>}
                  </div>
                  <div className="text-xs text-ink-500">
                    {c.role && <span>{c.role} · </span>}
                    {c.email} · {c.phone}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditing(c);
                    setDraft({ ...c });
                  }}
                  className="btn-ghost"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Modal
          open={creating || !!editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          title={editing ? `Edit ${editing.full_name}` : 'New contact'}
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
            <Field label="Role / title">
              <Input
                value={draft.role ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, role: e.target.value }))
                }
              />
            </Field>
            <Field label="Phone">
              <Input
                value={draft.phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, phone: e.target.value }))
                }
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={draft.email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, email: e.target.value }))
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={draft.is_default}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, is_default: e.target.checked }))
                }
              />
              Use as default contact on new contracts
            </label>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            {editing && (
              <button
                className="btn-danger mr-auto"
                onClick={() => {
                  contactsDB.remove(editing.id);
                  setEditing(null);
                  setVersion((v) => v + 1);
                }}
              >
                Delete
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              Cancel
            </button>
            <button className="btn-primary" onClick={onSave}>
              Save
            </button>
          </div>
        </Modal>
      </PageBody>
    </>
  );
}
