import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageBody, PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Empty } from '../../components/ui/Empty';
import {
  MilestoneBadge,
  TradeStatusBadge,
} from '../../components/trade/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Field, Input } from '../../components/ui/Field';
import {
  activityDB,
  banksDB,
  clientsDB,
  contactsDB,
  docsDB,
  duplicateTrade,
  entitiesDB,
  logActivity,
  nowIso,
  tradesDB,
  uid,
} from '../../lib/storage/db';
import { Timeline } from '../../components/trade/Timeline';
import { sendContract } from '../../lib/email';
import { isSupabaseEnabled } from '../../lib/supabase/client';
import { bytesToBlobUrl } from '../../lib/pdf/generator';
import { loadDocumentBlob, saveDocumentBlob } from '../../lib/storage/files';
import { evaluateMilestones } from '../../lib/milestones';
import {
  formatDate,
  formatDateTime,
  formatUSD,
} from '../../lib/format';
import { useAppStore } from '../../store/appStore';
import type { DocumentType, TradeDocument } from '../../types';

export function TradeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    evaluateMilestones();
  }, [version]);

  const trade = id ? tradesDB.byId(id) : undefined;
  if (!trade) {
    return (
      <PageBody>
        <Card>Trade not found.</Card>
      </PageBody>
    );
  }

  const isAdmin = user?.role === 'super_admin';
  const entity = entitiesDB.byId(trade.entity_id);
  const bank = banksDB.byId(trade.bank_profile_id);
  const client = clientsDB.byId(trade.client_id);
  const contact = contactsDB.byId(trade.contact_id);
  const docs = useMemo(
    () => docsDB.byTrade(trade.id),
    [trade.id, version],
  );
  const activity = useMemo(
    () => activityDB.byTrade(trade.id),
    [trade.id, version],
  );

  const [bolModal, setBolModal] = useState(false);
  const [sendModal, setSendModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => setVersion((v) => v + 1);

  const hasGenerated = docs.some((d) => d.document_type === 'sales_contract');

  const onDuplicate = () => {
    if (!user) return;
    if (
      !confirm(
        'Duplicate this trade?\n\nWe\'ll clone the cargo, pricing structure and supplier PDF, then open the editor as a fresh draft. Dates and milestones reset.',
      )
    )
      return;
    const clone = duplicateTrade(trade.id, user.id);
    if (clone) navigate(`/trades/${clone.id}/editor`);
  };

  const onSendContractDone = () => {
    setSendModal(false);
    refresh();
  };

  const markAdvanceReceived = () => {
    tradesDB.update(trade.id, {
      advance_status: 'received',
      advance_received_at: nowIso(),
      trade_status: trade.bol_date ? 'shipped' : 'advance_received',
    });
    logActivity(
      trade.id,
      'milestone_received',
      `50% advance received (${formatUSD(trade.sale_total / 2)})`,
      undefined,
      user?.id,
    );
    refresh();
  };

  const markBalanceReceived = () => {
    tradesDB.update(trade.id, {
      balance_status: 'received',
      balance_received_at: nowIso(),
      trade_status: 'balance_received',
    });
    logActivity(
      trade.id,
      'milestone_received',
      `50% balance received — trade complete`,
      undefined,
      user?.id,
    );
    refresh();
  };

  const onUpload = async (
    type: DocumentType,
    file: File,
    bolDate?: string,
  ) => {
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const storagePath = await saveDocumentBlob(
      trade.id,
      type,
      bytes,
      file.name,
    );
    docsDB.insert({
      id: uid('doc'),
      trade_id: trade.id,
      document_type: type,
      file_name: file.name,
      storage_path: storagePath,
      uploaded_by: user?.id ?? 'system',
      uploaded_at: nowIso(),
    });
    if (type === 'bol' && bolDate) {
      tradesDB.update(trade.id, {
        bol_date: new Date(bolDate).toISOString(),
        trade_status:
          trade.advance_status === 'received' ? 'shipped' : 'shipped',
      });
    }
    if (type === 'signed_contract' && !trade.signing_date) {
      tradesDB.update(trade.id, {
        signing_date: nowIso(),
        trade_status: 'active',
      });
    }
    logActivity(
      trade.id,
      'document_uploaded',
      `${file.name} uploaded as ${type.replace('_', ' ')}`,
      undefined,
      user?.id,
    );
    refresh();
  };

  const onDownloadDoc = async (doc: TradeDocument) => {
    try {
      const bytes = await loadDocumentBlob(doc.storage_path);
      const url = bytesToBlobUrl(bytes);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
      alert(`Could not download "${doc.file_name}".`);
    }
  };

  const onAuditZip = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    for (const d of docs) {
      try {
        const bytes = await loadDocumentBlob(d.storage_path);
        zip.file(d.file_name, bytes);
      } catch (err) {
        console.error(`Skipping ${d.file_name} — ${(err as Error).message}`);
      }
    }
    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          trade: trade.trade_reference,
          entity: entity?.name,
          client: client?.company_name,
          contract_date: trade.contract_date,
          documents: docs.map((d) => ({
            type: d.document_type,
            file: d.file_name,
            uploaded_at: d.uploaded_at,
          })),
        },
        null,
        2,
      ),
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trade.trade_reference}-audit.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const fin = {
    sale_total: trade.sale_total,
    total_costs: trade.total_costs,
    net_profit: trade.net_profit,
    advance: trade.sale_total / 2,
    balance: trade.sale_total / 2,
  };

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {trade.trade_reference}
            <TradeStatusBadge status={trade.trade_status} />
          </span>
        }
        description={`${client?.company_name ?? '—'} · ${trade.product_description.slice(0, 60)}…`}
        breadcrumb={
          <span>
            <button onClick={() => navigate('/trades')} className="hover:text-ink-700">
              Trades
            </button>{' '}
            / {trade.trade_reference}
          </span>
        }
        actions={
          isAdmin && (
            <>
              <button
                type="button"
                onClick={onDuplicate}
                className="btn-secondary"
                title="Clone this trade as a fresh draft"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 012-2h10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Duplicate
              </button>
              <button
                type="button"
                onClick={onAuditZip}
                className="btn-secondary"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Audit ZIP
              </button>
              <Link
                to={`/trades/${trade.id}/print`}
                className="btn-secondary"
                title="Open the printable contract — use the browser's Save as PDF from there"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9V2h12v7" strokeLinejoin="round" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" strokeLinejoin="round" />
                  <rect x="6" y="14" width="12" height="8" rx="1" />
                </svg>
                Preview & Print
              </Link>
              {hasGenerated && (
                <button
                  type="button"
                  onClick={() => setSendModal(true)}
                  className="btn-secondary"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
                  </svg>
                  Send to client
                </button>
              )}
              <Link to={`/trades/${trade.id}/editor`} className="btn-primary">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" strokeLinecap="round" />
                  <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4z" strokeLinejoin="round" />
                </svg>
                {hasGenerated ? 'Edit & regenerate' : 'Open editor'}
              </Link>
            </>
          )
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6 min-w-0">
            {isAdmin && (
              <FinancialBreakdown trade={trade} />
            )}

            <Card pad={false}>
              <header className="flex items-center justify-between p-5 border-b border-ink-100">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">
                    Milestones
                  </h2>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Payment events tied to T+7 deadlines
                  </p>
                </div>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                        50% Advance
                      </div>
                      {/* Internal Team has no financial visibility (PRD §3.4
                          + §9.1). Show only the milestone status, not the $. */}
                      {isAdmin && (
                        <div className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                          {formatUSD(fin.advance)}
                        </div>
                      )}
                    </div>
                    <MilestoneBadge status={trade.advance_status} />
                  </div>
                  <div className="mt-2 text-xs text-ink-500">
                    Due {formatDate(trade.advance_due_date)}
                    {trade.advance_received_at &&
                      ` · received ${formatDate(trade.advance_received_at)}`}
                  </div>
                  {isAdmin &&
                    trade.advance_status !== 'received' && (
                      <button
                        onClick={markAdvanceReceived}
                        className="mt-3 btn-secondary"
                      >
                        Mark as received
                      </button>
                    )}
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                        50% Balance
                      </div>
                      {isAdmin && (
                        <div className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                          {formatUSD(fin.balance)}
                        </div>
                      )}
                    </div>
                    <MilestoneBadge status={trade.balance_status} />
                  </div>
                  <div className="mt-2 text-xs text-ink-500">
                    {trade.bol_date
                      ? `Due ${formatDate(trade.balance_due_date)}`
                      : 'Awaiting BOL date'}
                    {trade.balance_received_at &&
                      ` · received ${formatDate(trade.balance_received_at)}`}
                  </div>
                  {isAdmin &&
                    trade.balance_status !== 'received' && (
                      <button
                        onClick={markBalanceReceived}
                        className="mt-3 btn-secondary"
                        disabled={!trade.bol_date}
                        title={
                          !trade.bol_date
                            ? 'Upload the BOL first'
                            : undefined
                        }
                      >
                        Mark as received
                      </button>
                    )}
                </div>
              </div>
            </Card>

            <Card pad={false}>
              <header className="flex items-center justify-between p-5 border-b border-ink-100">
                <div>
                  <h2 className="text-base font-semibold text-ink-900">
                    Trade folder
                  </h2>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Single source of truth — all documents for this deal
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBolModal(true)}
                      className="btn-secondary"
                    >
                      Upload BOL
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-secondary"
                    >
                      Upload signed contract
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onUpload('signed_contract', f);
                        e.currentTarget.value = '';
                      }}
                    />
                  </div>
                )}
              </header>

              {docs.length === 0 ? (
                <div className="p-5">
                  <Empty
                    title="No documents yet"
                    description="Generate the mirrored sales contract or upload supporting files."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {docs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-4 p-5 hover:bg-ink-50/60"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M14 3H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V7l-4-4z" strokeLinejoin="round" />
                          <path d="M14 3v4h4" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-900 truncate">
                          {d.file_name}
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">
                          {DOC_TYPE_LABEL[d.document_type]} ·{' '}
                          {formatDateTime(d.uploaded_at)}
                        </div>
                      </div>
                      <button
                        className="btn-ghost"
                        onClick={() => onDownloadDoc(d)}
                      >
                        Download
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* ----- Sidebar ----- */}
          <aside className="space-y-4">
            <Card>
              <h3 className="text-sm font-semibold text-ink-900">Parties</h3>
              <dl className="mt-3 space-y-3 text-sm">
                <Pair label="Acting entity" value={entity?.name} />
                <Pair
                  label="Bank profile"
                  value={bank?.profile_name}
                />
                <Pair
                  label="Client"
                  value={
                    <Link
                      to="/clients"
                      className="hover:text-brand-600"
                    >
                      {client?.company_name}
                    </Link>
                  }
                />
                <Pair label="Country" value={client?.country} />
                <Pair label="Contact" value={contact?.full_name} />
                <Pair label="Email" value={contact?.email} />
              </dl>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink-900">Cargo</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Pair label="Quantity" value={`${trade.quantity_tons} t`} />
                <Pair label="Brand" value={trade.brand} />
                <Pair label="Origin" value={trade.origin} />
                <Pair label="Destination" value={trade.destination} />
                <Pair label="Incoterm" value={trade.incoterm} />
                <Pair label="Plant" value={trade.plant_no} />
                <Pair label="Shipment" value={trade.shipment_date} />
              </dl>
            </Card>

            <Card pad={false}>
              <header className="p-4 border-b border-ink-100">
                <h3 className="text-sm font-semibold text-ink-900">
                  Timeline
                </h3>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Every action on this trade
                </p>
              </header>
              <Timeline events={activity} />
            </Card>
          </aside>
        </div>

        <BolUploadModal
          open={bolModal}
          onClose={() => setBolModal(false)}
          onUpload={(file, date) => {
            onUpload('bol', file, date);
            setBolModal(false);
          }}
        />

        <SendContractModal
          open={sendModal}
          onClose={() => setSendModal(false)}
          tradeId={trade.id}
          tradeRef={trade.trade_reference}
          clientName={client?.company_name ?? ''}
          defaultTo={[contact?.email, client?.contact_email]
            .filter((s): s is string => Boolean(s))
            .filter((v, i, a) => a.indexOf(v) === i)}
          documents={docs}
          actorId={user?.id}
          onDone={onSendContractDone}
        />
      </PageBody>
    </>
  );
}

function SendContractModal({
  open,
  onClose,
  tradeId,
  tradeRef,
  clientName,
  defaultTo,
  documents,
  actorId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tradeId: string;
  tradeRef: string;
  clientName: string;
  defaultTo: string[];
  documents: TradeDocument[];
  actorId?: string;
  onDone: () => void;
}) {
  const supabaseEnabled = isSupabaseEnabled();
  const [toRaw, setToRaw] = useState(defaultTo.join(', '));
  const [ccRaw, setCcRaw] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(
    `Sales contract ${tradeRef} — Chipa Farm LLC`,
  );
  const [message, setMessage] = useState(
    `Dear ${clientName.split(' ')[0] || 'Partner'},\n\nPlease find attached our sales contract ${tradeRef} for your review and signature.\n\nBest regards,\nChipa Farm LLC`,
  );
  // Default attachment: the latest sales_contract; signed_contract if present
  const sellableDocs = documents.filter(
    (d) =>
      d.document_type === 'sales_contract' ||
      d.document_type === 'signed_contract' ||
      d.document_type === 'bol',
  );
  const [attachIds, setAttachIds] = useState<string[]>(() => {
    const latest = [...sellableDocs]
      .filter((d) => d.document_type === 'sales_contract')
      .sort((a, b) =>
        new Date(b.uploaded_at).getTime() -
        new Date(a.uploaded_at).getTime(),
      )[0];
    return latest ? [latest.id] : [];
  });
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ scheduled: boolean; simulated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setToRaw(defaultTo.join(', '));
      setCcRaw('');
      setShowCc(false);
      setSent(null);
      setError(null);
      setSending(false);
    }
  }, [open, defaultTo]);

  const parseEmails = (s: string) =>
    s
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter(Boolean);

  const toEmails = parseEmails(toRaw);
  const ccEmails = parseEmails(ccRaw);
  const validRecipient = toEmails.length > 0 && toEmails.every((e) => /.+@.+\..+/.test(e));
  const canSend =
    validRecipient && attachIds.length > 0 && subject.trim().length > 0;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const result = await sendContract(
      {
        tradeId,
        to: toEmails,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject,
        message,
        attachmentDocumentIds: attachIds,
        schedule_at:
          scheduleEnabled && scheduleAt
            ? new Date(scheduleAt).toISOString()
            : undefined,
      },
      actorId,
    );
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not send.');
      return;
    }
    setSent({
      scheduled: Boolean(result.scheduled),
      simulated: Boolean(result.simulated),
    });
    setTimeout(onDone, 1500);
  };

  return (
    <Modal open={open} onClose={onClose} title="Send contract" size="lg">
      {sent ? (
        <div className="py-8 text-center animate-in">
          <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-50 text-success-700 ring-4 ring-success-100">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-ink-900">
            {sent.scheduled ? 'Scheduled' : 'Sent'} to {toEmails.join(', ')}
          </h3>
          <p className="mt-1.5 text-sm text-ink-500">
            {sent.simulated
              ? 'Demo mode — wire your Supabase project to send real emails.'
              : sent.scheduled
                ? 'Resend will deliver at the time you specified. Status appears on the trade timeline.'
                : 'Resend confirmed delivery. Trade marked Active.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 mb-4 text-xs text-brand-700 flex items-start gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
            </svg>
            <div>
              {supabaseEnabled
                ? 'Real email — uses your Resend integration. Recipients receive a branded HTML email with the PDF attached.'
                : 'Demo mode — the email is simulated. Configure Supabase + Resend env vars for real delivery.'}
            </div>
          </div>

          <div className="space-y-4">
            <Field label="To" required>
              <Input
                type="text"
                value={toRaw}
                onChange={(e) => setToRaw(e.target.value)}
                placeholder="email@example.com, second@example.com"
              />
              {!showCc && (
                <button
                  type="button"
                  className="mt-1 text-xs text-brand-600 hover:underline"
                  onClick={() => setShowCc(true)}
                >
                  + Add CC
                </button>
              )}
            </Field>

            {showCc && (
              <Field label="CC">
                <Input
                  type="text"
                  value={ccRaw}
                  onChange={(e) => setCcRaw(e.target.value)}
                  placeholder="cc@example.com"
                />
              </Field>
            )}

            <Field label="Subject">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </Field>

            <Field label="Message">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="input min-h-[140px]"
              />
            </Field>

            <Field label="Attachments" hint="Choose what to attach to this email">
              {sellableDocs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-xs text-ink-500">
                  No documents yet — generate the contract first.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {sellableDocs.map((d) => (
                    <label
                      key={d.id}
                      className="flex items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-3 py-2 hover:border-ink-300 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={attachIds.includes(d.id)}
                        onChange={(e) =>
                          setAttachIds((curr) =>
                            e.target.checked
                              ? [...curr, d.id]
                              : curr.filter((x) => x !== d.id),
                          )
                        }
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-ink-900 truncate">
                          {d.file_name}
                        </div>
                        <div className="text-[11px] text-ink-500">
                          {d.document_type.replace('_', ' ')}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </Field>

            <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                />
                Schedule for later
              </label>
              {scheduleEnabled && (
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="mt-2 max-w-[260px]"
                />
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-danger-50 border border-danger-100 px-3 py-2 text-sm text-danger-700">
                {error}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button onClick={onClose} className="btn-secondary" type="button">
              Cancel
            </button>
            <button
              onClick={submit}
              className="btn-primary"
              type="button"
              disabled={!canSend || sending}
            >
              {sending ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Sending…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
                  </svg>
                  {scheduleEnabled && scheduleAt ? 'Schedule' : 'Send'}
                </>
              )}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

const DOC_TYPE_LABEL: Record<DocumentType, string> = {
  frigo_contract: 'Original Frigo contract',
  sales_contract: 'Mirrored sales contract',
  signed_contract: 'Signed contract',
  bol: 'Bill of Lading',
  other: 'Other',
};

function Pair({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <dt className="w-28 shrink-0 text-xs uppercase tracking-wide text-ink-500 font-semibold pt-0.5">
        {label}
      </dt>
      <dd className="text-ink-800 truncate">
        {value || <span className="text-ink-400">—</span>}
      </dd>
    </div>
  );
}

function FinancialBreakdown({ trade }: { trade: import('../../types').Trade }) {
  const profitClass =
    trade.net_profit >= 0 ? 'text-success-700' : 'text-danger-600';
  return (
    <Card pad={false}>
      <header className="flex items-center justify-between p-5 border-b border-ink-100">
        <div>
          <h2 className="text-base font-semibold text-ink-900">
            Financial breakdown
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Investment → costs → sale → net profit
          </p>
        </div>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-ink-100">
        <Stat
          label="Frigo cost"
          value={formatUSD(trade.frigo_total)}
          tone="ink"
        />
        <Stat
          label="Total costs"
          value={formatUSD(trade.total_costs)}
          tone="ink"
        />
        <Stat
          label="Sale total"
          value={formatUSD(trade.sale_total)}
          tone="ink"
        />
        <Stat
          label="Net profit"
          value={formatUSD(trade.net_profit)}
          tone="profit"
          className={profitClass}
        />
      </div>
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Mini label="Shipping" value={formatUSD(trade.shipping_cost)} />
        <Mini label="Insurance" value={formatUSD(trade.insurance_cost)} />
        <Mini label="Bank fees" value={formatUSD(trade.bank_fees)} />
        <Mini
          label="Margin"
          value={
            trade.sale_total > 0
              ? `${((trade.net_profit / trade.sale_total) * 100).toFixed(1)}%`
              : '—'
          }
        />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone: 'ink' | 'profit';
  className?: string;
}) {
  return (
    <div className="p-5">
      <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'profit' ? className : 'text-ink-900'}`}
      >
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-50 p-3">
      <div className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
        {value}
      </div>
    </div>
  );
}

function BolUploadModal({
  open,
  onClose,
  onUpload,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, date: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Modal open={open} onClose={onClose} title="Upload Bill of Lading">
      <div className="space-y-4">
        <Field label="BOL date" hint="Triggers the T+7 balance milestone">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="BOL PDF">
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-md file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-ink-200"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={!file}
            onClick={() => file && onUpload(file, date)}
            className="btn-primary"
          >
            Upload
          </button>
        </div>
      </div>
    </Modal>
  );
}
