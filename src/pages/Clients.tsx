import { useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Empty } from '../components/ui/Empty';
import { Field, Input, Textarea } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { clientsDB, nowIso, uid } from '../lib/storage/db';
import { useAppStore } from '../store/appStore';
import type { Client } from '../types';

const empty = (): Omit<Client, 'id' | 'created_at'> => ({
  company_name: '',
  address: '',
  city: '',
  country: '',
  tax_id: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  notes: '',
});

type SortKey = 'name' | 'country' | 'recent';

export function ClientsPage() {
  const user = useAppStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin';
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [editing, setEditing] = useState<Client | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(empty());

  const clients = useMemo(() => {
    const filtered = clientsDB
      .list()
      .filter(
        (c) =>
          c.company_name.toLowerCase().includes(search.toLowerCase()) ||
          c.country.toLowerCase().includes(search.toLowerCase()),
      );
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'name')
        return a.company_name.localeCompare(b.company_name);
      if (sortBy === 'country') {
        const c = a.country.localeCompare(b.country);
        return c !== 0 ? c : a.company_name.localeCompare(b.company_name);
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return sorted;
  }, [version, search, sortBy]);

  const onSave = () => {
    if (editing) {
      clientsDB.update(editing.id, draft);
    } else {
      clientsDB.insert({
        ...draft,
        id: uid('cli'),
        created_at: nowIso(),
      });
    }
    setEditing(null);
    setCreating(false);
    setDraft(empty());
    setVersion((v) => v + 1);
  };

  const startEdit = (c: Client) => {
    setEditing(c);
    setDraft({ ...c });
  };

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} buyer${clients.length === 1 ? '' : 's'} on file`}
        actions={
          isAdmin && (
            <button
              className="btn-primary"
              onClick={() => {
                setCreating(true);
                setDraft(empty());
              }}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              Add client
            </button>
          )
        }
      />
      <PageBody>
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-ink-100">
            <Input
              placeholder="Search by company or country…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <select
              className="input w-full sm:w-auto"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort clients"
            >
              <option value="name">Sort by name</option>
              <option value="country">Sort by country</option>
              <option value="recent">Most recently added</option>
            </select>
          </div>
          {clients.length === 0 ? (
            <div className="p-5">
              <Empty
                title="No clients"
                description="Add a buyer to start mirroring contracts to them."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {clients.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-4 p-5 hover:bg-ink-50/60"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 font-semibold">
                    {c.company_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-900 truncate">
                      {c.company_name}
                    </div>
                    <div className="text-xs text-ink-500 truncate">
                      {c.contact_name} · {c.contact_email} · {c.country}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => startEdit(c)}
                      className="btn-ghost"
                    >
                      Edit
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Modal
          open={creating || !!editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          title={editing ? `Edit ${editing.company_name}` : 'New client'}
          size="lg"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Company name" required className="sm:col-span-2">
              <Input
                value={draft.company_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, company_name: e.target.value }))
                }
              />
            </Field>
            <Field label="Tax ID / RUC">
              <Input
                value={draft.tax_id}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tax_id: e.target.value }))
                }
              />
            </Field>
            <Field label="Country" required>
              <Input
                value={draft.country}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, country: e.target.value }))
                }
              />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input
                value={draft.address}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, address: e.target.value }))
                }
              />
            </Field>
            <Field label="City">
              <Input
                value={draft.city}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, city: e.target.value }))
                }
              />
            </Field>
            <Field label="Contact name">
              <Input
                value={draft.contact_name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact_name: e.target.value }))
                }
              />
            </Field>
            <Field label="Contact email">
              <Input
                type="email"
                value={draft.contact_email}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact_email: e.target.value }))
                }
              />
            </Field>
            <Field label="Contact phone">
              <Input
                value={draft.contact_phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, contact_phone: e.target.value }))
                }
              />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea
                value={draft.notes ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, notes: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            {editing && (
              <button
                className="btn-danger mr-auto"
                onClick={() => {
                  if (confirm(`Delete ${editing.company_name}?`)) {
                    clientsDB.remove(editing.id);
                    setEditing(null);
                    setVersion((v) => v + 1);
                  }
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
