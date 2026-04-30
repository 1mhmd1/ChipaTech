import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageBody, PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Field, Select } from '../../components/ui/Field';
import {
  banksDB,
  clientsDB,
  contactsDB,
  docsDB,
  entitiesDB,
  logActivity,
  nowIso,
  tradesDB,
  uid,
} from '../../lib/storage/db';
import { parseSupplierContract } from '../../lib/pdf/parser';
import { fileToArrayBuffer } from '../../lib/pdf/generator';
import { saveDocumentBlob } from '../../lib/storage/files';
import { computeFinancials } from '../../lib/finance';
import { bestMatch } from '../../lib/match';
import { useAppStore } from '../../store/appStore';
import type { Client, ParsedContract, Trade } from '../../types';
import clsx from 'clsx';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Field';

type Step = 'upload' | 'select' | 'review';

export function NewTradePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppStore((s) => s.user);
  // Fast-flow: dashboard can hand us a pre-selected File via location.state
  const handoff = (location.state as { file?: File } | null)?.file;
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileBytes, setFileBytes] = useState<ArrayBuffer | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string>();
  const [parsed, setParsed] = useState<ParsedContract | null>(null);

  const entities = useMemo(() => entitiesDB.list(), []);
  const banks = useMemo(() => banksDB.list(), []);
  const [clientsVersion, setClientsVersion] = useState(0);
  const clients = useMemo(() => clientsDB.list(), [clientsVersion]);
  const contacts = useMemo(() => contactsDB.list(), []);

  // Default to the LLC entity if it exists, else first
  const defaultEntity =
    entities.find((e) => /llc|farm/i.test(e.name)) ?? entities[0];
  const [entityId, setEntityId] = useState(defaultEntity?.id ?? '');
  const [bankProfileId, setBankProfileId] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [contactId, setContactId] = useState(
    contactsDB.default()?.id ?? contacts[0]?.id ?? '',
  );

  // Smart-match results — surfaced as a banner above the form
  const [autoMatch, setAutoMatch] = useState<
    | { kind: 'matched'; client: Client; score: number }
    | { kind: 'suggest_new'; parsedName: string }
    | null
  >(null);
  const [showCreateClient, setShowCreateClient] = useState(false);

  // When entity changes, default the bank profile
  useEffect(() => {
    if (!entityId) return;
    const def = banksDB.defaultFor(entityId);
    if (def) setBankProfileId(def.id);
    else {
      const first = banksDB.byEntity(entityId)[0];
      if (first) setBankProfileId(first.id);
    }
  }, [entityId]);

  const fileInput = useRef<HTMLInputElement>(null);

  // Fast-flow autostart
  const handoffStarted = useRef(false);
  useEffect(() => {
    if (handoff && !handoffStarted.current) {
      handoffStarted.current = true;
      handleFile(handoff);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff]);

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setParseError(undefined);
    try {
      const ab = await fileToArrayBuffer(f);
      // Clone the buffer because pdfjs/pdf-lib will detach the original
      const clone = ab.slice(0);
      setFileBytes(ab);
      const result = await parseSupplierContract(clone);
      setParsed(result);

      // ----- Smart auto-fill -----
      // 1. Try to fuzzy-match the parsed client name against existing clients.
      const parsedName = result.clientName?.trim();
      if (parsedName) {
        const match = bestMatch(
          parsedName,
          clientsDB.list(),
          (c) => c.company_name,
          0.55,
        );
        if (match) {
          setClientId(match.item.id);
          setAutoMatch({
            kind: 'matched',
            client: match.item,
            score: match.score,
          });
        } else {
          setAutoMatch({ kind: 'suggest_new', parsedName });
        }
      }
      // 2. Default contact = the one flagged is_default
      const defaultContact = contactsDB.default();
      if (defaultContact) setContactId(defaultContact.id);
      // 3. Bank profile already cascades from entityId via useEffect

      setStep('select');
    } catch (e) {
      console.error(e);
      setParseError(
        'Could not parse this PDF. Make sure it is a digitally generated supplier contract (not a scan).',
      );
    } finally {
      setParsing(false);
    }
  };

  const onCreateClientFromParsed = (newClient: Client) => {
    clientsDB.insert(newClient);
    setClientsVersion((v) => v + 1);
    setClientId(newClient.id);
    setAutoMatch({
      kind: 'matched',
      client: newClient,
      score: 1,
    });
    setShowCreateClient(false);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) await handleFile(f);
  };

  const createTrade = async () => {
    if (!parsed || !fileBytes || !user) return;
    if (!entityId || !bankProfileId || !clientId || !contactId) return;

    const reference = tradesDB.nextReference();
    const tradeId = uid('trd');
    const now = nowIso();

    const fin = computeFinancials({
      quantity_tons: parsed.quantity,
      frigo_total: parsed.totalAmount,
      sale_unit_price: parsed.unitPrice, // start at parity — admin marks it up next
      shipping_cost: 0,
      insurance_cost: 0,
      bank_fees: 0,
    });

    const trade: Trade = {
      id: tradeId,
      trade_reference: reference,
      entity_id: entityId,
      bank_profile_id: bankProfileId,
      client_id: clientId,
      contact_id: contactId,
      contract_date: now,
      frigo_contract_ref: parsed.contractRef || '—',
      quantity_tons: parsed.quantity,
      product_description: parsed.productDescription,
      frigo_unit_price: parsed.unitPrice,
      frigo_total: parsed.totalAmount,
      sale_unit_price: parsed.unitPrice,
      sale_total: fin.sale_total,
      shipping_cost: 0,
      insurance_cost: 0,
      bank_fees: 0,
      total_costs: fin.total_costs,
      net_profit: fin.net_profit,
      brand: parsed.brand,
      validity: parsed.validity,
      temperature: parsed.temperature,
      packing: parsed.packing,
      shipment_date: parsed.shipmentDate,
      origin: parsed.origin,
      destination: parsed.destination,
      incoterm: parsed.incoterm,
      plant_no: parsed.plantNo,
      freight_condition: parsed.freightCondition,
      observations: parsed.observations,
      prepayment_condition: parsed.prepaymentCondition,
      balance_condition: parsed.balanceCondition,
      advance_status: 'pending',
      balance_status: 'pending',
      trade_status: 'draft',
      created_at: now,
      updated_at: now,
    };

    tradesDB.insert(trade);

    // Save the original supplier PDF into the trade folder. In Supabase
    // mode this uploads to the `trade-documents` bucket; in demo mode
    // it inlines as a data URL so localStorage works offline.
    const cloneForBase64 = fileBytes.slice(0);
    const bytes = new Uint8Array(cloneForBase64);
    try {
      const storagePath = await saveDocumentBlob(
        tradeId,
        'frigo_contract',
        bytes,
        file?.name ?? 'frigo-contract.pdf',
      );
      docsDB.insert({
        id: uid('doc'),
        trade_id: tradeId,
        document_type: 'frigo_contract',
        file_name: file?.name ?? 'frigo-contract.pdf',
        storage_path: storagePath,
        uploaded_by: user.id,
        uploaded_at: now,
      });
    } catch (err) {
      console.error('Failed to upload supplier PDF', err);
      const msg = (err as Error).message ?? '';
      const isQuota =
        /quota/i.test(msg) ||
        /exceed/i.test(msg) ||
        err instanceof DOMException &&
          (err.name === 'QuotaExceededError' ||
            err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      alert(
        isQuota
          ? `Could not save the supplier PDF — the browser ran out of storage space. ` +
              `The trade was still created; open it and use the "Re-upload supplier PDF" prompt in the editor. ` +
              `If you keep hitting this, set up Supabase env vars so files go to the cloud instead.`
          : `Could not upload the supplier PDF: ${msg}. ` +
              `The trade was created — open it and use the "Re-upload supplier PDF" prompt in the editor to fix it.`,
      );
    }

    logActivity(
      tradeId,
      'trade_created',
      `Trade ${reference} created from supplier contract ${parsed.contractRef}`,
      undefined,
      user.id,
    );

    navigate(`/trades/${tradeId}/editor`);
  };

  return (
    <>
      <PageHeader
        title="New trade"
        breadcrumb={
          <span>
            <button
              onClick={() => navigate('/trades')}
              className="hover:text-ink-700"
            >
              Trades
            </button>{' '}
            / New
          </span>
        }
      />
      <PageBody>
        <div className="mx-auto max-w-4xl">
          <Stepper step={step} />

          {step === 'upload' && (
            <Card>
              <h2 className="text-base font-semibold text-ink-900">
                Upload supplier contract
              </h2>
              <p className="text-sm text-ink-500 mt-1">
                Drop the Frigorífico Concepción PDF. We'll parse the cargo, pricing
                and bank details automatically.
              </p>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => fileInput.current?.click()}
                className={clsx(
                  'mt-5 cursor-pointer rounded-xl border-2 border-dashed bg-ink-50/50 px-6 py-12 text-center transition',
                  parsing
                    ? 'border-brand-300 bg-brand-50/40'
                    : 'border-ink-300 hover:border-brand-400 hover:bg-brand-50/30',
                )}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {parsing ? (
                  <div>
                    <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
                    <div className="text-sm font-medium text-ink-700">
                      Parsing contract…
                    </div>
                    <div className="text-xs text-ink-400 mt-1">
                      Extracting cargo, banking and pricing data
                    </div>
                  </div>
                ) : file ? (
                  <div>
                    <div className="text-sm font-semibold text-ink-900">
                      {file.name}
                    </div>
                    <div className="mt-1 text-xs text-ink-500">
                      {(file.size / 1024).toFixed(1)} KB · click to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <svg
                      className="mx-auto mb-3 h-10 w-10 text-ink-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M14 3H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V7l-4-4z" strokeLinejoin="round" />
                      <path d="M14 3v4h4" strokeLinejoin="round" />
                      <path d="M12 12v6M9 15l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="text-sm font-medium text-ink-700">
                      Drag & drop a PDF here
                    </div>
                    <div className="text-xs text-ink-500 mt-1">
                      or click to browse
                    </div>
                  </div>
                )}

                {parseError && (
                  <div className="mt-4 mx-auto max-w-md rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                    {parseError}
                  </div>
                )}
              </div>
            </Card>
          )}

          {step === 'select' && parsed && (
            <Card>
              <h2 className="text-base font-semibold text-ink-900">
                Configure the trade
              </h2>
              <p className="text-sm text-ink-500 mt-1">
                Pick the acting entity, client and contact. We pre-selected your
                defaults.
              </p>

              {autoMatch?.kind === 'matched' && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-success-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-success-700">
                      Matched existing client ({Math.round(autoMatch.score * 100)}% confidence)
                    </div>
                    <div className="text-success-700/80 mt-0.5">
                      We auto-selected{' '}
                      <span className="font-medium">{autoMatch.client.company_name}</span>{' '}
                      based on the parsed name "{parsed.clientName}".
                    </div>
                  </div>
                  <button
                    className="text-xs font-semibold text-success-700 hover:underline"
                    onClick={() => setAutoMatch(null)}
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {autoMatch?.kind === 'suggest_new' && (
                <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-warning-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold text-warning-700">
                      No matching client found
                    </div>
                    <div className="text-warning-700/80 mt-0.5">
                      The PDF mentions{' '}
                      <span className="font-medium">"{autoMatch.parsedName}"</span>{' '}
                      — pick from your existing list, or create a new client
                      pre-filled with parsed details.
                    </div>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowCreateClient(true)}
                  >
                    Create client
                  </button>
                </div>
              )}

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Acting entity" required>
                  <Select
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                  >
                    {entities.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name} ({ent.country})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Banking profile"
                  required
                  hint="Cascades into the contract's bank section"
                >
                  <Select
                    value={bankProfileId}
                    onChange={(e) => setBankProfileId(e.target.value)}
                  >
                    {banks
                      .filter((b) => b.entity_id === entityId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.profile_name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Client" required>
                  <Select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    {clients.length === 0 && (
                      <option value="">No clients — add one first</option>
                    )}
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} — {c.country}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Contact person" required>
                  <Select
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                  >
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} {c.is_default ? '(default)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="mt-6 rounded-xl bg-ink-50 p-4 text-sm space-y-2">
                <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                  Detected from PDF
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-ink-700">
                  <div>Contract: <span className="font-mono">{parsed.contractRef || '—'}</span></div>
                  <div>Quantity: <span className="font-medium">{parsed.quantity} t</span></div>
                  <div>Product: <span className="text-ink-600">{parsed.productDescription || '—'}</span></div>
                  <div>Frigo total: <span className="font-medium">${parsed.totalAmount.toFixed(2)}</span></div>
                  <div>Origin: {parsed.origin || '—'}</div>
                  <div>Destination: {parsed.destination || '—'}</div>
                </div>
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setStep('upload');
                    setFile(null);
                    setParsed(null);
                    setFileBytes(null);
                  }}
                >
                  ← Replace PDF
                </button>
                <button
                  className="btn-primary"
                  onClick={createTrade}
                  disabled={
                    !entityId || !bankProfileId || !clientId || !contactId
                  }
                >
                  Create trade & open editor →
                </button>
              </div>
            </Card>
          )}

          {showCreateClient && parsed && (
            <CreateClientModal
              open={showCreateClient}
              onClose={() => setShowCreateClient(false)}
              parsed={parsed}
              onCreate={onCreateClientFromParsed}
            />
          )}
        </div>
      </PageBody>
    </>
  );
}

function CreateClientModal({
  open,
  onClose,
  parsed,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  parsed: ParsedContract;
  onCreate: (client: Client) => void;
}) {
  const [draft, setDraft] = useState<Omit<Client, 'id' | 'created_at'>>({
    company_name: parsed.clientName ?? '',
    address: parsed.clientAddress ?? '',
    city: parsed.clientCity ?? '',
    country: parsed.clientCountry ?? '',
    tax_id: '',
    contact_name: parsed.contactPerson ?? '',
    contact_email: parsed.contactEmail ?? '',
    contact_phone: parsed.contactPhone ?? '',
    notes: '',
  });

  const submit = () => {
    if (!draft.company_name) return;
    onCreate({
      ...draft,
      id: uid('cli'),
      created_at: nowIso(),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Create client from PDF" size="lg">
      <p className="text-sm text-ink-500 mb-4">
        Pre-filled from the parsed contract — review and adjust before saving.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name" required className="sm:col-span-2">
          <Input
            value={draft.company_name}
            onChange={(e) =>
              setDraft((d) => ({ ...d, company_name: e.target.value }))
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
        <Field label="City">
          <Input
            value={draft.city}
            onChange={(e) =>
              setDraft((d) => ({ ...d, city: e.target.value }))
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
        <Field label="Tax ID / RUC">
          <Input
            value={draft.tax_id}
            onChange={(e) =>
              setDraft((d) => ({ ...d, tax_id: e.target.value }))
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
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button
          onClick={submit}
          className="btn-primary"
          disabled={!draft.company_name}
        >
          Save & use this client
        </button>
      </div>
    </Modal>
  );
}

function Stepper({ step }: { step: Step }) {
  const items: { key: Step; label: string }[] = [
    { key: 'upload', label: '1. Upload PDF' },
    { key: 'select', label: '2. Configure' },
    { key: 'review', label: '3. Edit & generate' },
  ];
  const idx = items.findIndex((i) => i.key === step);
  return (
    <nav className="mb-6 flex items-center gap-2 text-sm">
      {items.map((it, i) => (
        <div key={it.key} className="flex items-center">
          <span
            className={clsx(
              'rounded-full px-3 py-1 font-medium',
              i < idx
                ? 'bg-success-50 text-success-700'
                : i === idx
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-100 text-ink-500',
            )}
          >
            {it.label}
          </span>
          {i < items.length - 1 && (
            <span className="mx-2 h-px w-6 bg-ink-200" />
          )}
        </div>
      ))}
    </nav>
  );
}
