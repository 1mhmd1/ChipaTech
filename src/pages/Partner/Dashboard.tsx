import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageBody, PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Empty } from '../../components/ui/Empty';
import { KPICard } from '../../components/trade/KPICard';
import { TradeStatusBadge } from '../../components/trade/StatusBadge';
import {
  clientsDB,
  entitiesDB,
  tradesDB,
} from '../../lib/storage/db';
import { formatDate, formatUSD } from '../../lib/format';

export function PartnerDashboardPage() {
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

  const totalCapital = trades.reduce((s, t) => s + (t.frigo_total || 0), 0);
  const totalProfit = trades.reduce((s, t) => s + (t.net_profit || 0), 0);
  const active = trades.filter(
    (t) => t.trade_status !== 'balance_received' && t.trade_status !== 'draft',
  ).length;
  const overdueCount = trades.filter((t) => t.trade_status === 'overdue').length;

  return (
    <>
      <PageHeader
        title="Portfolio"
        description="Read-only view of trade activity and net performance"
      />
      <PageBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            label="Total Trades"
            value={trades.length}
            hint={`${active} active`}
            tone="brand"
          />
          <KPICard
            label="Capital Deployed"
            value={formatUSD(totalCapital)}
            hint="across all trades"
          />
          <KPICard
            label="Net Profit"
            value={formatUSD(totalProfit)}
            tone="success"
          />
          <KPICard
            label="Overdue"
            value={overdueCount}
            tone={overdueCount > 0 ? 'danger' : 'neutral'}
          />
        </div>

        <Card pad={false}>
          <header className="p-5 border-b border-ink-100">
            <h2 className="text-base font-semibold text-ink-900">
              All trades
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Investment, costs and net profit per deal
            </p>
          </header>
          {trades.length === 0 ? (
            <div className="p-5">
              <Empty
                title="No trades yet"
                description="Trade data will appear here once activity begins."
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-500 border-b border-ink-100">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Trade</th>
                  <th className="text-left px-5 py-3 font-semibold">Client</th>
                  <th className="text-left px-5 py-3 font-semibold">Entity</th>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-right px-5 py-3 font-semibold">
                    Investment
                  </th>
                  <th className="text-right px-5 py-3 font-semibold">Sale</th>
                  <th className="text-right px-5 py-3 font-semibold">Profit</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-ink-100 last:border-0 table-row-hover"
                  >
                    <td className="px-5 py-3">
                      <Link
                        to={`/partner/trades/${t.id}`}
                        className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-600"
                      >
                        {t.trade_reference}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-ink-700">
                      {clientById.get(t.client_id) ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-ink-500 text-xs">
                      {entityById.get(t.entity_id) ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-ink-500">
                      {formatDate(t.contract_date)}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-700">
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
                    <td className="px-5 py-3">
                      <TradeStatusBadge status={t.trade_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </PageBody>
    </>
  );
}
