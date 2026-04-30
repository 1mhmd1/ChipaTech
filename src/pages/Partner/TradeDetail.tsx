import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody, PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import {
  MilestoneBadge,
  TradeStatusBadge,
} from '../../components/trade/StatusBadge';
import {
  banksDB,
  clientsDB,
  contactsDB,
  docsDB,
  entitiesDB,
  tradesDB,
} from '../../lib/storage/db';
import { bytesToBlobUrl } from '../../lib/pdf/generator';
import { loadDocumentBlob } from '../../lib/storage/files';
import {
  formatDate,
  formatDateTime,
  formatUSD,
} from '../../lib/format';
import type { TradeDocument } from '../../types';

export function PartnerTradeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trade = id ? tradesDB.byId(id) : undefined;

  const docs = useMemo(
    () => (trade ? docsDB.byTrade(trade.id) : []),
    [trade],
  );

  if (!trade) {
    return (
      <PageBody>
        <Card>Trade not found.</Card>
      </PageBody>
    );
  }

  const entity = entitiesDB.byId(trade.entity_id);
  const bank = banksDB.byId(trade.bank_profile_id);
  const client = clientsDB.byId(trade.client_id);
  const contact = contactsDB.byId(trade.contact_id);

  const downloadDoc = async (d: TradeDocument) => {
    try {
      const bytes = await loadDocumentBlob(d.storage_path);
      const url = bytesToBlobUrl(bytes);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed', err);
      alert(`Could not download "${d.file_name}".`);
    }
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
        description={`${client?.company_name ?? '—'} · ${entity?.name ?? '—'}`}
        breadcrumb={
          <span>
            <button
              onClick={() => navigate('/partner')}
              className="hover:text-ink-700"
            >
              Portfolio
            </button>{' '}
            / {trade.trade_reference}
          </span>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div className="space-y-6">
            <Card pad={false}>
              <header className="p-5 border-b border-ink-100">
                <h2 className="text-base font-semibold text-ink-900">
                  Financial breakdown
                </h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  Net profit shown — internal split is not displayed
                </p>
              </header>
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-ink-100">
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                    Investment
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.frigo_total)}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                    Total costs
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.total_costs)}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                    Sale total
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.sale_total)}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                    Net profit
                  </div>
                  <div
                    className={`mt-1 text-xl font-semibold tabular-nums ${
                      trade.net_profit >= 0
                        ? 'text-success-700'
                        : 'text-danger-600'
                    }`}
                  >
                    {formatUSD(trade.net_profit)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5 text-xs">
                <div className="rounded-lg bg-ink-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">
                    Shipping
                  </div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.shipping_cost)}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">
                    Insurance
                  </div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.insurance_cost)}
                  </div>
                </div>
                <div className="rounded-lg bg-ink-50 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-ink-500 font-semibold">
                    Bank fees
                  </div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.bank_fees)}
                  </div>
                </div>
              </div>
            </Card>

            <Card pad={false}>
              <header className="p-5 border-b border-ink-100">
                <h2 className="text-base font-semibold text-ink-900">Milestones</h2>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-ink-100">
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                      50% Advance
                    </div>
                    <MilestoneBadge status={trade.advance_status} />
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.sale_total / 2)}
                  </div>
                  <div className="text-xs text-ink-500 mt-1">
                    Due {formatDate(trade.advance_due_date)}
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
                      50% Balance
                    </div>
                    <MilestoneBadge status={trade.balance_status} />
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums text-ink-900">
                    {formatUSD(trade.sale_total / 2)}
                  </div>
                  <div className="text-xs text-ink-500 mt-1">
                    {trade.bol_date
                      ? `Due ${formatDate(trade.balance_due_date)}`
                      : 'Pending BOL'}
                  </div>
                </div>
              </div>
            </Card>

            <Card pad={false}>
              <header className="p-5 border-b border-ink-100">
                <h2 className="text-base font-semibold text-ink-900">
                  Documents
                </h2>
              </header>
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
                      <div className="text-xs text-ink-500">
                        {formatDateTime(d.uploaded_at)}
                      </div>
                    </div>
                    <button
                      className="btn-ghost"
                      onClick={() => downloadDoc(d)}
                    >
                      Download
                    </button>
                  </li>
                ))}
                {docs.length === 0 && (
                  <li className="p-5 text-sm text-ink-500">
                    No documents available.
                  </li>
                )}
              </ul>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card>
              <h3 className="text-sm font-semibold text-ink-900">Parties</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Pair label="Entity" value={entity?.name} />
                <Pair label="Bank" value={bank?.profile_name} />
                <Pair label="Client" value={client?.company_name} />
                <Pair label="Country" value={client?.country} />
                <Pair label="Contact" value={contact?.full_name} />
              </dl>
            </Card>
            <Card>
              <h3 className="text-sm font-semibold text-ink-900">Cargo</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Pair label="Quantity" value={`${trade.quantity_tons} t`} />
                <Pair label="Origin" value={trade.origin} />
                <Pair label="Destination" value={trade.destination} />
                <Pair label="Incoterm" value={trade.incoterm} />
                <Pair label="Plant" value={trade.plant_no} />
              </dl>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function Pair({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <dt className="w-24 shrink-0 text-xs uppercase tracking-wide text-ink-500 font-semibold pt-0.5">
        {label}
      </dt>
      <dd className="text-ink-800 truncate">
        {value || <span className="text-ink-400">—</span>}
      </dd>
    </div>
  );
}
