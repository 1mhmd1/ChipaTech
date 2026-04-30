import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Empty } from '../../components/ui/Empty';
import { Input, Select } from '../../components/ui/Field';
import { TradeStatusBadge } from '../../components/trade/StatusBadge';
import { clientsDB, entitiesDB, tradesDB } from '../../lib/storage/db';
import { formatDate, formatUSD } from '../../lib/format';
import { useAppStore } from '../../store/appStore';
import type { TradeStatus } from '../../types';

export function TradesListPage() {
  const user = useAppStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TradeStatus | 'all'>('all');

  const trades = useMemo(() => tradesDB.list(), []);
  const clientById = useMemo(() => {
    const m = new Map<string, string>();
    clientsDB.list().forEach((c) => m.set(c.id, c.company_name));
    return m;
  }, []);
  const entityById = useMemo(() => {
    const m = new Map<string, string>();
    entitiesDB.list().forEach((e) => m.set(e.id, e.name));
    return m;
  }, []);

  const filtered = trades.filter((t) => {
    if (statusFilter !== 'all' && t.trade_status !== statusFilter) return false;
    if (!search) return true;
    const haystack = [
      t.trade_reference,
      t.frigo_contract_ref,
      clientById.get(t.client_id),
      entityById.get(t.entity_id),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <>
      <PageHeader
        title="Trades"
        description={`${trades.length} trades · ${filtered.length} shown`}
        actions={
          isAdmin && (
            <Link to="/trades/new" className="btn-primary">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              </svg>
              New trade
            </Link>
          )
        }
      />
      <PageBody>
        <Card pad={false}>
          <div className="flex flex-wrap items-center gap-3 p-4 border-b border-ink-100">
            <Input
              placeholder="Search by reference, client, contract…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as TradeStatus | 'all')
              }
              className="max-w-xs"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="advance_received">Advance Received</option>
              <option value="shipped">Shipped</option>
              <option value="balance_received">Completed</option>
              <option value="overdue">Overdue</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="p-6">
              <Empty
                title={trades.length === 0 ? 'No trades yet' : 'Nothing matches'}
                description={
                  trades.length === 0
                    ? 'Upload a supplier PDF to start your first mirrored contract.'
                    : 'Try a different search or status filter.'
                }
                action={
                  trades.length === 0 && isAdmin ? (
                    <Link to="/trades/new" className="btn-primary">
                      Create first trade
                    </Link>
                  ) : null
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-500">
                  <tr className="border-b border-ink-100">
                    <th className="text-left px-5 py-3 font-semibold">Reference</th>
                    <th className="text-left px-5 py-3 font-semibold">Client</th>
                    <th className="text-left px-5 py-3 font-semibold">Entity</th>
                    <th className="text-left px-5 py-3 font-semibold">Date</th>
                    {/* Internal Team cannot see ANY financial columns
                        (PRD §3.4 + §9.1). Only Super Admin gets them. */}
                    {isAdmin && (
                      <>
                        <th className="text-right px-5 py-3 font-semibold">
                          Frigo cost
                        </th>
                        <th className="text-right px-5 py-3 font-semibold">
                          Sale
                        </th>
                        <th className="text-right px-5 py-3 font-semibold">
                          Profit
                        </th>
                      </>
                    )}
                    <th className="text-left px-5 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-ink-100 last:border-0 table-row-hover"
                    >
                      <td className="px-5 py-3">
                        <Link
                          to={`/trades/${t.id}`}
                          className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-600"
                        >
                          {t.trade_reference}
                        </Link>
                        <div className="text-[11px] text-ink-400 mt-0.5">
                          Frigo {t.frigo_contract_ref}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-ink-700">
                        {clientById.get(t.client_id) ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-ink-700 text-xs">
                        {entityById.get(t.entity_id) ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-ink-500">
                        {formatDate(t.contract_date)}
                      </td>
                      {isAdmin && (
                        <>
                          <td className="px-5 py-3 text-right tabular-nums text-ink-500">
                            {formatUSD(t.frigo_total)}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums text-ink-700">
                            {formatUSD(t.sale_total)}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            <span
                              className={
                                t.net_profit >= 0
                                  ? 'text-success-700 font-medium'
                                  : 'text-danger-600 font-medium'
                              }
                            >
                              {formatUSD(t.net_profit)}
                            </span>
                          </td>
                        </>
                      )}
                      <td className="px-5 py-3">
                        <TradeStatusBadge status={t.trade_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageBody>
    </>
  );
}
