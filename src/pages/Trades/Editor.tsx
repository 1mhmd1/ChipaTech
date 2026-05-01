import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody, PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Field, Input, LockedField, Textarea } from '../../components/ui/Field';
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
import {
  downloadPdf,
  generateMirroredContract,
  type MirrorPayload,
} from '../../lib/pdf/generator';
import { loadDocumentBlob, saveDocumentBlob } from '../../lib/storage/files';
import { computeFinancials } from '../../lib/finance';
import { formatMoney, formatTons, formatUSD } from '../../lib/format';
import { useAppStore } from '../../store/appStore';
import { WarningsList } from '../../components/trade/Warnings';
import { buildWarnings } from '../../components/trade/warnings-helpers';
import { sendContract } from '../../lib/email';
import { Badge } from '../../components/ui/Badge';
import { Spinner } from '../../components/ui/Spinner';
import type { Trade } from '../../types';

export function ContractEditorPage() {
  const { id } = useParams();
  const trade = id ? tradesDB.byId(id) : undefined;
  if (!trade) {
    return (
      <PageBody>
        <Card>Trade not found.</Card>
      </PageBody>
    );
  }

  return <ContractEditorInner trade={trade} />;
}

function ContractEditorInner({ trade }: { trade: Trade }) {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);

  const entities = useMemo(() => entitiesDB.list(), []);
  const banks = useMemo(() => banksDB.list(), []);
  const clients = useMemo(() => clientsDB.list(), []);
  const contacts = useMemo(() => contactsDB.list(), []);

  // ---- Editable model (kept in component state, persisted on Save / Generate)
  const [entityId, setEntityId] = useState(trade.entity_id);
  const [bankProfileId, setBankProfileId] = useState(trade.bank_profile_id);
  const [clientId, setClientId] = useState(trade.client_id);
  const [contactId, setContactId] = useState(trade.contact_id);

  // Per-field overrides — start from joined records but allow edit
  const entity = entities.find((e) => e.id === entityId)!;
  const bank = banks.find((b) => b.id === bankProfileId);
  const client = clients.find((c) => c.id === clientId);
  const contact = contacts.find((c) => c.id === contactId);

  const [exporterName, setExporterName] = useState(entity?.name ?? '');
  const [exporterRUC, setExporterRUC] = useState(entity?.ruc_ein ?? '');
  const [exporterAddress, setExporterAddress] = useState(entity?.address ?? '');
  const [exporterCity, setExporterCity] = useState(entity?.city ?? '');
  const [exporterCountry, setExporterCountry] = useState(entity?.country ?? '');

  useEffect(() => {
    if (!entity) return;
    setExporterName(entity.name);
    setExporterRUC(entity.ruc_ein);
    setExporterAddress(entity.address);
    setExporterCity(entity.city);
    setExporterCountry(entity.country);
    const def = banksDB.defaultFor(entity.id);
    if (def) setBankProfileId(def.id);
  }, [entityId]);

  const [clientName, setClientName] = useState(client?.company_name ?? '');
  const [clientAddress, setClientAddress] = useState(client?.address ?? '');
  const [clientCity, setClientCity] = useState(client?.city ?? '');
  const [clientCountry, setClientCountry] = useState(client?.country ?? '');
  useEffect(() => {
    if (!client) return;
    setClientName(client.company_name);
    setClientAddress(client.address);
    setClientCity(client.city);
    setClientCountry(client.country);
  }, [clientId]);

  const [contactName, setContactName] = useState(contact?.full_name ?? '');
  const [contactPhone, setContactPhone] = useState(contact?.phone ?? '');
  const [contactEmail, setContactEmail] = useState(contact?.email ?? '');
  useEffect(() => {
    if (!contact) return;
    setContactName(contact.full_name);
    setContactPhone(contact.phone);
    setContactEmail(contact.email);
  }, [contactId]);

  // Bank fields (editable per-contract overrides)
  const [bankFields, setBankFields] = useState({
    intermediaryName: bank?.intermediary_bank_name ?? '',
    intermediarySwift: bank?.intermediary_bank_swift ?? '',
    intermediaryAccountNumber: bank?.intermediary_account_number ?? '',
    intermediaryLocation: bank?.intermediary_location ?? '',
    araNumber: bank?.ara_number ?? '',
    localBankName: bank?.bank_name ?? '',
    localBankSwift: bank?.bank_swift ?? '',
    accountNumber: bank?.account_number ?? '',
    beneficiary: bank?.beneficiary_name ?? '',
  });
  useEffect(() => {
    if (!bank) return;
    setBankFields({
      intermediaryName: bank.intermediary_bank_name,
      intermediarySwift: bank.intermediary_bank_swift,
      intermediaryAccountNumber: bank.intermediary_account_number ?? '',
      intermediaryLocation: bank.intermediary_location ?? '',
      araNumber: bank.ara_number ?? '',
      localBankName: bank.bank_name,
      localBankSwift: bank.bank_swift,
      accountNumber: bank.account_number,
      beneficiary: bank.beneficiary_name,
    });
  }, [bankProfileId]);

  // Pricing & costs (PRD §9.1: Frigo Purchase Price is editable by SuperAdmin)
  const [saleUnitPrice, setSaleUnitPrice] = useState(
    trade.sale_unit_price || trade.frigo_unit_price,
  );
  const [frigoUnitPrice, setFrigoUnitPrice] = useState(
    trade.frigo_unit_price,
  );
  const frigoTotal = frigoUnitPrice * trade.quantity_tons;
  const [shippingCost, setShippingCost] = useState(trade.shipping_cost ?? 0);
  const [insuranceCost, setInsuranceCost] = useState(trade.insurance_cost ?? 0);
  const [bankFees, setBankFees] = useState(trade.bank_fees ?? 0);
  const [signingDate, setSigningDate] = useState(
    (trade.signing_date ?? trade.contract_date).slice(0, 10),
  );

  // Payment terms — editable text + computed values (admin can override text)
  const fin = computeFinancials({
    quantity_tons: trade.quantity_tons,
    frigo_total: frigoTotal,
    sale_unit_price: saleUnitPrice,
    shipping_cost: shippingCost,
    insurance_cost: insuranceCost,
    bank_fees: bankFees,
  });

  const advanceDueDate = useMemo(() => {
    if (!signingDate) return '';
    const d = new Date(signingDate);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, [signingDate]);

  const defaultPrepayment = `50% until ${formatDateShort(advanceDueDate)} - Advanced value: ${formatMoney(fin.advance_amount)}`;
  const defaultBalance = `50% TT AGAINST COPY OF BL BY EMAIL`;

  const [prepaymentText, setPrepaymentText] = useState(
    trade.prepayment_condition || defaultPrepayment,
  );
  const [balanceText, setBalanceText] = useState(
    trade.balance_condition || defaultBalance,
  );

  // Auto-resync the prepayment text whenever financials change, unless the
  // user has manually edited it. We detect that by checking against the
  // last-auto value.
  const [autoPrepayment, setAutoPrepayment] = useState(true);
  useEffect(() => {
    if (autoPrepayment) setPrepaymentText(defaultPrepayment);
  }, [defaultPrepayment, autoPrepayment]);

  // ----- generate -----
  const [generating, setGenerating] = useState(false);
  // Auto-email on Generate (PRD desire layer): when checked, after the
  // contract is generated and saved we immediately invoke the
  // send-contract Edge Function with sensible defaults.
  const [autoEmail, setAutoEmail] = useState(false);
  const [autoEmailStatus, setAutoEmailStatus] = useState<
    null | { ok: boolean; message: string }
  >(null);

  // ----- source PDF presence + re-upload recovery -----
  // The supplier PDF gets attached at trade-creation. If it was never
  // saved (browser quota, network failure, manual storage clear, or a
  // duplicate from a trade that itself was missing it), the editor
  // would otherwise throw "Original supplier PDF missing" on Generate.
  // We detect that up-front and give the user an inline re-upload UI.
  const [sourceVersion, setSourceVersion] = useState(0);
  const sourceMissing = useMemo(() => {
    const docs = docsDB.byTrade(trade.id);
    return !docs.some((d) => d.document_type === 'frigo_contract');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id, sourceVersion]);
  const [reuploading, setReuploading] = useState(false);
  const [reuploadError, setReuploadError] = useState<string | null>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);

  const onReuploadSource = async (file: File) => {
    if (!user) return;
    setReuploading(true);
  setReuploadError(null);
    try {
      const ab = await file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const storagePath = await saveDocumentBlob(
        trade.id,
        'frigo_contract',
        bytes,
        file.name,
      );
      docsDB.insert({
        id: uid('doc'),
        trade_id: trade.id,
        document_type: 'frigo_contract',
        file_name: file.name,
        storage_path: storagePath,
        uploaded_by: user.id,
        uploaded_at: nowIso(),
      });
      logActivity(
        trade.id,
        'document_uploaded',
        `Supplier PDF re-uploaded: ${file.name}`,
        undefined,
        user.id,
      );
      setSourceVersion((v) => v + 1);
    } catch (err) {
      const msg = (err as Error).message ?? '';
      setReuploadError(
        /quota/i.test(msg) || /exceeded/i.test(msg)
          ? 'Browser storage is full — clear demo data or configure Supabase to store large PDFs in the cloud.'
          : msg || 'Could not save the file.',
      );
      // force a re-render so the error surfaces
      setSourceVersion((v) => v + 1);
    } finally {
      setReuploading(false);
    }
  };

  const buildPayload = (): MirrorPayload => ({
    exporter: {
      name: exporterName,
      ruc: exporterRUC,
      address: exporterAddress,
      city: exporterCity,
      country: exporterCountry,
    },
    client: {
      name: clientName,
      address: clientAddress,
      city: clientCity,
      country: clientCountry,
    },
    contact: {
      name: contactName,
      phone: contactPhone,
      email: contactEmail,
    },
    payer: {
      name: clientName,
      country: clientCountry,
      companyCountry: exporterCountry,
    },
    product: {
      quantity: trade.quantity_tons,
      description: trade.product_description,
      unitPrice: saleUnitPrice,
    },
    costs: {
      freight: shippingCost,
      insurance: insuranceCost,
    },
    prepaymentCondition: prepaymentText,
    balanceCondition: balanceText,
    bank: bankFields,
    // Per PRD §7.2: the bottom-right BUYER signature is the Active
    // Entity name, not the end client. The mirrored contract retains
    // the supplier-side structure: Frigo as Producer (untouched
    // signature), Active Entity as Buyer.
    buyerName: exporterName,
    parsedQuantityText: formatTons(trade.quantity_tons),
  });

  const fetchSourcePdf = async (): Promise<ArrayBuffer | null> => {
    const docs = docsDB.byTrade(trade.id);
    const source = docs.find((d) => d.document_type === 'frigo_contract');
    if (!source) return null;
    const bytes = await loadDocumentBlob(source.storage_path);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  };

  const persistTrade = () => {
    const updated = tradesDB.update(trade.id, {
      entity_id: entityId,
      bank_profile_id: bankProfileId,
      client_id: clientId,
      contact_id: contactId,
      frigo_unit_price: frigoUnitPrice,
      frigo_total: frigoTotal,
      sale_unit_price: saleUnitPrice,
      sale_total: fin.sale_total,
      shipping_cost: shippingCost,
      insurance_cost: insuranceCost,
      bank_fees: bankFees,
      total_costs: fin.total_costs,
      net_profit: fin.net_profit,
      signing_date: new Date(signingDate).toISOString(),
      advance_due_date: advanceDueDate
        ? new Date(advanceDueDate).toISOString()
        : undefined,
      prepayment_condition: prepaymentText,
      balance_condition: balanceText,
      updated_at: nowIso(),
    });
    return updated;
  };

  const onGenerate = async () => {
    if (sourceMissing) return; // re-upload banner is doing the prompting
    setGenerating(true);
    try {
      const src = await fetchSourcePdf();
      if (!src) {
        setSourceVersion((v) => v + 1);
        return;
      }
      const out = await generateMirroredContract(src, buildPayload());

      // Persist trade values
      persistTrade();

      // Save generated PDF to trade folder
      const fileName = `${trade.trade_reference}-sales-contract.pdf`;
      const storagePath = await saveDocumentBlob(
        trade.id,
        'sales_contract',
        out,
        fileName,
      );
      const docId = uid('doc');
      docsDB.insert({
        id: docId,
        trade_id: trade.id,
        document_type: 'sales_contract',
        file_name: fileName,
        storage_path: storagePath,
        uploaded_by: user?.id ?? 'system',
        uploaded_at: nowIso(),
      });

      logActivity(
        trade.id,
        'contract_generated',
        `Mirrored sales contract generated (${formatUSD(fin.sale_total)} sale, ${formatUSD(fin.net_profit)} net)`,
        undefined,
        user?.id,
      );

      // Move trade to "active"
      tradesDB.update(trade.id, { trade_status: 'active' });

      // Trigger download
      await downloadPdf(
        out,
        `${trade.trade_reference}-sales-contract.pdf`,
      );

      // Auto-email on Generate — fire it AFTER the doc is saved so the
      // Edge Function can read it from Supabase Storage.
      if (autoEmail) {
        const recipients = [contactEmail, client?.contact_email]
          .filter((e): e is string => Boolean(e && /.+@.+\..+/.test(e)));
        if (recipients.length === 0) {
          setAutoEmailStatus({
            ok: false,
            message:
              'Auto-email skipped: no valid recipient (set Client contact email).',
          });
        } else {
          // Storage may need a beat to confirm the upload before the
          // Edge Function tries to download it.
          await new Promise((r) => setTimeout(r, 400));
          const result = await sendContract(
            {
              tradeId: trade.id,
              to: [recipients[0]],
              cc: recipients.slice(1),
              subject: `Sales contract ${trade.trade_reference} — ${exporterName}`,
              message:
                `Dear ${(client?.contact_name ?? clientName.split(' ')[0]) || 'Partner'},\n\n` +
                `Please find attached our sales contract ${trade.trade_reference} for your review and signature.\n\n` +
                `Best regards,\n${exporterName}`,
              attachmentDocumentIds: [docId],
            },
            user?.id,
          );
          if (result.ok) {
            setAutoEmailStatus({
              ok: true,
              message: result.simulated
                ? `Email simulated (demo mode) to ${recipients[0]}.`
                : `Email sent to ${recipients[0]}.`,
            });
          } else {
            setAutoEmailStatus({
              ok: false,
              message: `Auto-email failed: ${result.error ?? 'unknown error'}. The contract is still saved.`,
            });
          }
        }
        // Give the user a moment to read the toast before redirect
        setTimeout(() => navigate(`/trades/${trade.id}`), 1400);
      } else {
        navigate(`/trades/${trade.id}`);
      }
    } catch (e) {
      console.error(e);
      alert((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Contract editor"
        description={`${trade.trade_reference} · ${trade.product_description.slice(0, 60)}…`}
        breadcrumb={
          <span>
            <button onClick={() => navigate('/trades')} className="hover:text-ink-700">
              Trades
            </button>{' '}
            /{' '}
            <button onClick={() => navigate(`/trades/${trade.id}`)} className="hover:text-ink-700">
              {trade.trade_reference}
            </button>{' '}
            / Editor
          </span>
        }
        actions={
          <>
            {/* Save current edits, then jump to the HTML preview/print page.
                This is the primary "fresh PDF" path the manager asked for —
                no supplier-PDF dependency, no overlay. */}
            <button
              type="button"
              onClick={() => {
                persistTrade();
                navigate(`/trades/${trade.id}/print`);
              }}
              className="btn-secondary"
              title="Save edits and open the printable contract — use the browser's Save as PDF from there."
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9V2h12v7" strokeLinejoin="round" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" strokeLinejoin="round" />
                <rect x="6" y="14" width="12" height="8" rx="1" />
              </svg>
              Preview & Print
            </button>
            <label
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-ink-200 bg-white text-sm text-ink-700 cursor-pointer hover:border-ink-300 select-none"
              title="When checked, the generated contract is emailed to the client immediately after Generate. Uses the Resend integration via Supabase Edge Function."
            >
              <input
                type="checkbox"
                checked={autoEmail}
                onChange={(e) => setAutoEmail(e.target.checked)}
                className="cursor-pointer"
              />
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
              </svg>
              Auto-email
            </label>
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || sourceMissing}
              className="btn-primary"
              title="Mirror the supplier PDF (legacy path). Use Preview & Print for a fresh, generated contract instead."
            >
              {generating ? (
                <>
                  <Spinner />
                  {autoEmail ? 'Generating & sending…' : 'Generating…'}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5 21h14" strokeLinecap="round" />
                  </svg>
                  {autoEmail ? 'Generate & send' : 'Generate & download'}
                </>
              )}
            </button>
          </>
        }
      />
      {autoEmailStatus && (
        <div
          className={
            'mx-8 mt-4 rounded-lg border px-4 py-3 text-sm ' +
            (autoEmailStatus.ok
              ? 'border-success-200 bg-success-50 text-success-700'
              : 'border-warning-200 bg-warning-50 text-warning-700')
          }
        >
          {autoEmailStatus.message}
        </div>
      )}
      <PageBody>
        {sourceMissing && (
          <div className="mb-6 relative overflow-hidden rounded-xl border border-warning-200/80 bg-gradient-to-br from-warning-50/70 to-white p-5 shadow-soft">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-700 ring-4 ring-warning-50">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 3H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V7l-4-4z" strokeLinejoin="round" />
                  <path d="M14 3v4h4M12 11v6M9 14l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-warning-700">
                  Supplier PDF is missing for this trade
                </div>
                <p className="mt-1 text-sm text-warning-700/80 leading-relaxed">
                  We can't find the original Frigorífico Concepción contract
                  for{' '}
                  <span className="font-mono font-semibold">
                    {trade.trade_reference}
                  </span>
                  . Most likely the upload didn't finish (browser storage
                  limit, network drop, or this trade was duplicated from
                  one missing the file). Re-attach it below to continue.
                </p>
                {reuploadError && (
                  <div className="mt-2 text-xs text-danger-700">
                    {reuploadError}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <input
                    ref={reuploadInputRef}
                    type="file"
                    accept="application/pdf"
                    aria-label="Re-upload supplier PDF"
                    title="Re-upload supplier PDF"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) await onReuploadSource(f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => reuploadInputRef.current?.click()}
                    disabled={reuploading}
                  >
                    {reuploading ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Re-upload supplier PDF
                      </>
                    )}
                  </button>
                  <span className="text-xs text-ink-500">
                    PDF only · same Frigo template (701-2026)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
          {/* ----- Left: editable form ----- */}
          <div className="space-y-6 min-w-0">
            <Section title="Acting Entity" subtitle="Replaces the supplier identity on the contract">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Entity">
                  <select
                    className="input"
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                  >
                    {entities.map((ent) => (
                      <option key={ent.id} value={ent.id}>
                        {ent.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Bank profile">
                  <select
                    className="input"
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
                  </select>
                </Field>
                <Field label="Legal name" className="sm:col-span-2">
                  <Input
                    value={exporterName}
                    onChange={(e) => setExporterName(e.target.value)}
                  />
                </Field>
                <Field label="RUC / EIN">
                  <Input
                    value={exporterRUC}
                    onChange={(e) => setExporterRUC(e.target.value)}
                  />
                </Field>
                <Field label="City">
                  <Input
                    value={exporterCity}
                    onChange={(e) => setExporterCity(e.target.value)}
                  />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <Input
                    value={exporterAddress}
                    onChange={(e) => setExporterAddress(e.target.value)}
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={exporterCountry}
                    onChange={(e) => setExporterCountry(e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Buyer (Client)" subtitle="Auto-mirrors into the Payer block">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Saved client" className="sm:col-span-2">
                  <select
                    className="input"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company_name} — {c.country}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Company name" className="sm:col-span-2">
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <Input
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                  />
                </Field>
                <Field label="City">
                  <Input
                    value={clientCity}
                    onChange={(e) => setClientCity(e.target.value)}
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={clientCountry}
                    onChange={(e) => setClientCountry(e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Contact Person" subtitle="Replaces Frigo's sales contact">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Saved contact" className="sm:col-span-2">
                  <select
                    className="input"
                    value={contactId}
                    onChange={(e) => setContactId(e.target.value)}
                  >
                    {contacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Full name">
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                  />
                </Field>
                <Field label="Phone">
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                  />
                </Field>
                <Field label="Email" className="sm:col-span-2">
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Cargo specifications"
              subtitle="Pure mirror — locked to prevent transcription errors"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <LockedField
                  label="Quantity (tons)"
                  value={trade.quantity_tons}
                />
                <LockedField label="Brand" value={trade.brand} />
                <LockedField
                  label="Product description"
                  value={trade.product_description}
                />
                <LockedField label="Validity" value={trade.validity} />
                <LockedField label="Temperature" value={trade.temperature} />
                <LockedField label="Packing" value={trade.packing} />
                <LockedField label="Shipment date" value={trade.shipment_date} />
                <LockedField label="Origin" value={trade.origin} />
                <LockedField label="Destination" value={trade.destination} />
                <LockedField label="Incoterm" value={trade.incoterm} />
                <LockedField label="Plant No." value={trade.plant_no} />
                <LockedField
                  label="Freight condition"
                  value={trade.freight_condition}
                />
              </div>
            </Section>

            <Section title="Pricing & costs" subtitle="Drives all financial calculations">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sale unit price (USD / ton)" required>
                  <Input
                    type="number"
                    step="0.01"
                    value={saleUnitPrice}
                    onChange={(e) =>
                      setSaleUnitPrice(parseFloat(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field
                  label="Frigo unit price (USD / ton)"
                  hint="Auto-scraped from supplier PDF — adjust if Frigo invoiced differently"
                >
                  <Input
                    type="number"
                    step="0.01"
                    value={frigoUnitPrice}
                    onChange={(e) =>
                      setFrigoUnitPrice(parseFloat(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label="Shipping cost (USD)">
                  <Input
                    type="number"
                    step="0.01"
                    value={shippingCost}
                    onChange={(e) =>
                      setShippingCost(parseFloat(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label="Insurance cost (USD)">
                  <Input
                    type="number"
                    step="0.01"
                    value={insuranceCost}
                    onChange={(e) =>
                      setInsuranceCost(parseFloat(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label="Bank fees (USD)">
                  <Input
                    type="number"
                    step="0.01"
                    value={bankFees}
                    onChange={(e) =>
                      setBankFees(parseFloat(e.target.value) || 0)
                    }
                  />
                </Field>
                <Field label="Signing date" hint="T+7 = advance milestone">
                  <Input
                    type="date"
                    value={signingDate}
                    onChange={(e) => setSigningDate(e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Payment terms"
              subtitle="Auto-recomputed from sale total — edit only if non-standard"
            >
              <div className="grid grid-cols-1 gap-4">
                <Field label="Prepayment condition (50% advance)">
                  <Textarea
                    value={prepaymentText}
                    onChange={(e) => {
                      setAutoPrepayment(false);
                      setPrepaymentText(e.target.value);
                    }}
                  />
                  {!autoPrepayment && (
                    <button
                      onClick={() => setAutoPrepayment(true)}
                      className="mt-1 text-xs text-brand-600 hover:underline"
                    >
                      Reset to auto-generated
                    </button>
                  )}
                </Field>
                <Field label="Balance condition (50% balance)">
                  <Textarea
                    value={balanceText}
                    onChange={(e) => setBalanceText(e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section
              title="Beneficiary's Bank"
              subtitle="Cascaded from the bank profile — overridable for one-off changes"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Beneficiary" className="sm:col-span-2">
                  <Input
                    value={bankFields.beneficiary}
                    onChange={(e) =>
                      setBankFields((b) => ({ ...b, beneficiary: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Local bank name">
                  <Input
                    value={bankFields.localBankName}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        localBankName: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Local bank SWIFT">
                  <Input
                    value={bankFields.localBankSwift}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        localBankSwift: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Account / IBAN">
                  <Input
                    value={bankFields.accountNumber}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        accountNumber: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="ARA Number (optional)">
                  <Input
                    value={bankFields.araNumber}
                    onChange={(e) =>
                      setBankFields((b) => ({ ...b, araNumber: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Intermediary bank">
                  <Input
                    value={bankFields.intermediaryName}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        intermediaryName: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Intermediary SWIFT">
                  <Input
                    value={bankFields.intermediarySwift}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        intermediarySwift: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Intermediary account #">
                  <Input
                    value={bankFields.intermediaryAccountNumber}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        intermediaryAccountNumber: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Intermediary location">
                  <Input
                    value={bankFields.intermediaryLocation}
                    onChange={(e) =>
                      setBankFields((b) => ({
                        ...b,
                        intermediaryLocation: e.target.value,
                      }))
                    }
                  />
                </Field>
              </div>
            </Section>
          </div>

          {/* ----- Right: live financial preview ----- */}
          <aside className="space-y-4 xl:sticky xl:top-[88px] self-start">
            {/* ===== Trade Summary — instant-glance hero ===== */}
            <Card
              className={
                fin.net_profit >= 0
                  ? 'bg-gradient-to-br from-success-50 to-white border-success-200'
                  : 'bg-gradient-to-br from-danger-50 to-white border-danger-200'
              }
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide font-semibold text-ink-500">
                    Trade summary
                  </div>
                  <div className="mt-1 font-mono text-sm font-semibold text-ink-900">
                    {trade.trade_reference}
                  </div>
                </div>
                <Badge tone={fin.net_profit >= 0 ? 'success' : 'danger'}>
                  {fin.net_profit >= 0 ? 'Profitable' : 'Loss'}
                </Badge>
              </div>
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-wide text-ink-500 font-semibold">
                  Net profit
                </div>
                <div
                  className={`text-3xl font-bold tabular-nums ${
                    fin.net_profit >= 0
                      ? 'text-success-700'
                      : 'text-danger-600'
                  }`}
                >
                  {formatUSD(fin.net_profit)}
                </div>
                <div className="text-xs text-ink-500 mt-0.5">
                  Margin{' '}
                  <span
                    className={`font-semibold ${fin.margin_pct < 5 ? 'text-warning-700' : 'text-ink-700'}`}
                  >
                    {fin.margin_pct.toFixed(1)}%
                  </span>{' '}
                  · Sale {formatUSD(fin.sale_total)}
                </div>
              </div>
            </Card>

            {/* ===== Smart checks ===== */}
            <Card>
              <h3 className="text-sm font-semibold text-ink-900 mb-3 flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand-600" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6z" strokeLinejoin="round" />
                  <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Smart checks
              </h3>
              <WarningsList
                items={buildWarnings({
                  saleUnitPrice,
                  frigoUnitPrice,
                  saleTotal: fin.sale_total,
                  netProfit: fin.net_profit,
                  marginPct: fin.margin_pct,
                  shipping: shippingCost,
                  insurance: insuranceCost,
                  bankFees: bankFees,
                })}
              />
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink-900">
                Financial preview
              </h3>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="Sale unit price" value={`$${saleUnitPrice.toFixed(2)}/t`} />
                <Row
                  label="Sale total"
                  value={formatUSD(fin.sale_total)}
                  bold
                />
                <hr className="my-2 border-ink-100" />
                <Row label="Frigo cost" value={formatUSD(frigoTotal)} muted />
                <Row label="Shipping" value={formatUSD(shippingCost)} muted />
                <Row label="Insurance" value={formatUSD(insuranceCost)} muted />
                <Row label="Bank fees" value={formatUSD(bankFees)} muted />
                <Row
                  label="Total costs"
                  value={formatUSD(fin.total_costs)}
                  bold
                />
                <hr className="my-2 border-ink-100" />
                <Row
                  label="Net profit"
                  value={formatUSD(fin.net_profit)}
                  highlight={fin.net_profit >= 0 ? 'success' : 'danger'}
                />
                <Row
                  label="Margin"
                  value={`${fin.margin_pct.toFixed(1)}%`}
                  muted
                />
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink-900">Milestones</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                    50% advance
                  </div>
                  <div className="mt-1 text-base font-semibold text-ink-900 tabular-nums">
                    {formatUSD(fin.advance_amount)}
                  </div>
                  <div className="text-xs text-ink-500">
                    Due {formatDateShort(advanceDueDate)} (T+7)
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                    50% balance
                  </div>
                  <div className="mt-1 text-base font-semibold text-ink-900 tabular-nums">
                    {formatUSD(fin.balance_amount)}
                  </div>
                  <div className="text-xs text-ink-500">
                    Due BOL date + 7 (set when BOL uploaded)
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-sm font-semibold text-ink-900">
                Mirror summary
              </h3>
              <ul className="mt-3 space-y-1.5 text-xs text-ink-600">
                <li className="flex items-start gap-1.5">
                  <Check /> Exporter replaced with{' '}
                  <span className="font-medium">{exporterName.split(' ')[0]}</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Check /> Banking section overlaid
                </li>
                <li className="flex items-start gap-1.5">
                  <Check /> Sale price &amp; totals recalculated
                </li>
                <li className="flex items-start gap-1.5">
                  <Check /> Cargo specs preserved verbatim
                </li>
                <li className="flex items-start gap-1.5">
                  <Check /> Halal &amp; claims clauses untouched
                </li>
              </ul>
            </Card>
          </aside>
        </div>

      </PageBody>
    </>
  );
}

function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleString('en-US', { month: 'short' }).toLowerCase()}/${d.getDate().toString().padStart(2, '0')}/${d.getFullYear()}`;
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <header className="mb-4">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {subtitle && (
          <p className="text-xs text-ink-500 mt-0.5">{subtitle}</p>
        )}
      </header>
      {children}
    </Card>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
  bold?: boolean;
  highlight?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? 'text-ink-500' : 'text-ink-700'}>{label}</span>
      <span
        className={`tabular-nums ${
          highlight === 'success'
            ? 'text-success-700 font-semibold'
            : highlight === 'danger'
              ? 'text-danger-600 font-semibold'
              : bold
                ? 'font-semibold text-ink-900'
                : 'text-ink-700'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 mt-0.5 shrink-0 text-success-600" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

