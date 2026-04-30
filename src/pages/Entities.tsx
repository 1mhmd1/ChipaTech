import { useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { banksDB, entitiesDB, nowIso, uid } from '../lib/storage/db';
import type { BankProfile, Entity } from '../types';

export function EntitiesPage() {
  const [version, setVersion] = useState(0);
  const entities = useMemo(() => entitiesDB.list(), [version]);
  const banks = useMemo(() => banksDB.list(), [version]);
  const [entityModal, setEntityModal] = useState<Entity | 'new' | null>(null);
  const [bankModal, setBankModal] = useState<
    BankProfile | { entity_id: string } | null
  >(null);

  return (
    <>
      <PageHeader
        title="Entities & Banking"
        description="Operational toggle between Chipa Tech E.A.S. (Paraguay) and Chipa Farm LLC (USA)"
        actions={
          <button
            className="btn-primary"
            onClick={() => setEntityModal('new')}
          >
            Add entity
          </button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {entities.map((ent) => {
            const ebanks = banks.filter((b) => b.entity_id === ent.id);
            return (
              <Card key={ent.id} pad={false}>
                <header className="flex items-start justify-between p-5 border-b border-ink-100">
                  <div>
                    <div className="text-base font-semibold text-ink-900">
                      {ent.name}
                    </div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      {ent.country} · RUC/EIN {ent.ruc_ein}
                    </div>
                    <div className="text-xs text-ink-500">
                      {ent.address} · {ent.city}
                    </div>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={() => setEntityModal(ent)}
                  >
                    Edit
                  </button>
                </header>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs uppercase tracking-wide font-semibold text-ink-500">
                      Banking profiles
                    </div>
                    <button
                      className="btn-ghost"
                      onClick={() => setBankModal({ entity_id: ent.id })}
                    >
                      + Add
                    </button>
                  </div>
                  {ebanks.length === 0 ? (
                    <div className="text-sm text-ink-400">
                      No bank profiles yet.
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {ebanks.map((b) => (
                        <li
                          key={b.id}
                          className="flex items-center justify-between rounded-lg border border-ink-200 bg-white p-3"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                              {b.profile_name}
                              {b.is_default && (
                                <Badge tone="brand">Default</Badge>
                              )}
                            </div>
                            <div className="text-xs text-ink-500 truncate">
                              {b.bank_name} · {b.bank_swift} · {b.account_number}
                            </div>
                          </div>
                          <button
                            className="btn-ghost"
                            onClick={() => setBankModal(b)}
                          >
                            Edit
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {entityModal && (
          <EntityModal
            initial={entityModal === 'new' ? null : entityModal}
            onClose={() => setEntityModal(null)}
            onSaved={() => {
              setEntityModal(null);
              setVersion((v) => v + 1);
            }}
          />
        )}
        {bankModal && (
          <BankModal
            initial={'id' in bankModal ? bankModal : null}
            entityId={'id' in bankModal ? bankModal.entity_id : bankModal.entity_id}
            onClose={() => setBankModal(null)}
            onSaved={() => {
              setBankModal(null);
              setVersion((v) => v + 1);
            }}
          />
        )}
      </PageBody>
    </>
  );
}

function EntityModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Entity | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Omit<Entity, 'id' | 'created_at'>>(
    initial
      ? { ...initial }
      : {
          name: '',
          country: '',
          ruc_ein: '',
          address: '',
          city: '',
          is_active: true,
        },
  );

  const onSave = () => {
    if (initial) {
      entitiesDB.update(initial.id, draft);
    } else {
      entitiesDB.insert({
        ...draft,
        id: uid('ent'),
        created_at: nowIso(),
      });
    }
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : 'New entity'}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Legal name" className="sm:col-span-2" required>
          <Input
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
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
        <Field label="RUC / EIN">
          <Input
            value={draft.ruc_ein}
            onChange={(e) =>
              setDraft((d) => ({ ...d, ruc_ein: e.target.value }))
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
            onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))}
          />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={onSave} className="btn-primary">Save</button>
      </div>
    </Modal>
  );
}

function BankModal({
  initial,
  entityId,
  onClose,
  onSaved,
}: {
  initial: BankProfile | null;
  entityId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Omit<BankProfile, 'id' | 'created_at'>>(
    initial
      ? { ...initial }
      : {
          entity_id: entityId,
          profile_name: '',
          beneficiary_name: '',
          beneficiary_address: '',
          intermediary_bank_name: '',
          intermediary_bank_swift: '',
          intermediary_account_number: '',
          intermediary_location: '',
          bank_name: '',
          bank_swift: '',
          account_number: '',
          ara_number: '',
          field_71a: 'OUR',
          is_default: false,
        },
  );

  const onSave = () => {
    if (draft.is_default) {
      banksDB
        .byEntity(draft.entity_id)
        .filter((b) => b.id !== initial?.id)
        .forEach((b) => banksDB.update(b.id, { is_default: false }));
    }
    if (initial) {
      banksDB.update(initial.id, draft);
    } else {
      banksDB.insert({
        ...draft,
        id: uid('bank'),
        created_at: nowIso(),
      });
    }
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? `Edit ${initial.profile_name}` : 'New bank profile'}
      size="lg"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Profile name" className="sm:col-span-2" required>
          <Input
            value={draft.profile_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, profile_name: e.target.value }))
            }
          />
        </Field>
        <Field label="Beneficiary name" className="sm:col-span-2">
          <Input
            value={draft.beneficiary_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, beneficiary_name: e.target.value }))
            }
          />
        </Field>
        <Field label="Beneficiary address" className="sm:col-span-2">
          <Input
            value={draft.beneficiary_address}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                beneficiary_address: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Local bank name">
          <Input
            value={draft.bank_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, bank_name: e.target.value }))
            }
          />
        </Field>
        <Field label="Local bank SWIFT">
          <Input
            value={draft.bank_swift}
            onChange={(e) =>
              setDraft((d) => ({ ...d, bank_swift: e.target.value }))
            }
          />
        </Field>
        <Field label="Account / IBAN">
          <Input
            value={draft.account_number}
            onChange={(e) =>
              setDraft((d) => ({ ...d, account_number: e.target.value }))
            }
          />
        </Field>
        <Field label="ARA number (optional)">
          <Input
            value={draft.ara_number ?? ''}
            onChange={(e) =>
              setDraft((d) => ({ ...d, ara_number: e.target.value }))
            }
          />
        </Field>
        <Field label="Intermediary bank">
          <Input
            value={draft.intermediary_bank_name}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                intermediary_bank_name: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Intermediary SWIFT">
          <Input
            value={draft.intermediary_bank_swift}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                intermediary_bank_swift: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Intermediary account #">
          <Input
            value={draft.intermediary_account_number ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                intermediary_account_number: e.target.value,
              }))
            }
          />
        </Field>
        <Field label="Intermediary location">
          <Input
            value={draft.intermediary_location ?? ''}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                intermediary_location: e.target.value,
              }))
            }
          />
        </Field>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={draft.is_default}
            onChange={(e) =>
              setDraft((d) => ({ ...d, is_default: e.target.checked }))
            }
          />
          Use as default for this entity
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {initial && (
          <button
            className="btn-danger mr-auto"
            onClick={() => {
              banksDB.remove(initial.id);
              onSaved();
            }}
          >
            Delete
          </button>
        )}
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={onSave} className="btn-primary">Save</button>
      </div>
    </Modal>
  );
}
