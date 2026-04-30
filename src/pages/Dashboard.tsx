import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { KPICard } from '../components/trade/KPICard';
import { TradeStatusBadge } from '../components/trade/StatusBadge';
import { Card } from '../components/ui/Card';
import { Empty } from '../components/ui/Empty';
import { duplicateTrade, tradesDB, clientsDB } from '../lib/storage/db';
import { formatDate, formatUSD } from '../lib/format';
import { evaluateMilestones, type MilestoneAlert } from '../lib/milestones';
import { useAppStore } from '../store/appStore';
import clsx from 'clsx';

export function DashboardPage() {
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [alerts, setAlerts] = useState<MilestoneAlert[]>([]);
  const fastFlowInput = useRef<HTMLInputElement>(null);
  const [draggingFastFlow, setDraggingFastFlow] = useState(false);

  useEffect(() => {
    const found = evaluateMilestones();
    setAlerts(found);
  }, [version]);

  const onFastFlowFile = (f: File) => {
    // Hand the file to the wizard via location state — it autostarts parsing.
    navigate('/trades/new', { state: { file: f } });
  };

  const onDuplicateLatest = () => {
    if (!user) return;
    const latest = tradesDB.list()[0];
    if (!latest) {
      alert('No previous trades to duplicate yet.');
      return;
    }
    const clone = duplicateTrade(latest.id, user.id);
    if (clone) navigate(`/trades/${clone.id}/editor`);
  };

  const trades = useMemo(() => tradesDB.list(), [version]);
  const clientById = useMemo(() => {
    const map = new Map<string, string>();
    clientsDB.list().forEach((c) => map.set(c.id, c.company_name));
    return map;
  }, [version]);

  const totalTrades = trades.length;
  const activeTrades = trades.filter(
    (t) =>
      t.trade_status !== 'balance_received' && t.trade_status !== 'draft',
  ).length;
  const totalProfit = trades.reduce((sum, t) => sum + (t.net_profit || 0), 0);
  const totalSale = trades.reduce((sum, t) => sum + (t.sale_total || 0), 0);
  const overdueCount = trades.filter((t) => t.trade_status === 'overdue').length;
  const pendingMilestones = trades.filter(
    (t) => t.advance_status === 'pending' || t.balance_status === 'pending',
  ).length;

  const recent = trades.slice(0, 5);
  const isAdmin = user?.role === 'super_admin';

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational snapshot across all trades"
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
        {alerts.length > 0 && (
          <div
            className="mb-6 relative overflow-hidden rounded-xl border border-danger-200/80 px-5 py-4 shadow-soft"
            role="alert"
            style={{
              background:
                'linear-gradient(135deg, rgba(254, 226, 226, 0.5) 0%, rgba(255, 255, 255, 0.95) 80%)',
            }}
          >
            <div className="flex items-start gap-3.5">
              <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-100 text-danger-700 ring-4 ring-danger-50">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
                <span className="absolute inset-0 rounded-full bg-danger-400/40 animate-ping" />
              </div>
              <div className="flex-1 text-sm min-w-0">
                <div className="text-[15px] font-semibold text-danger-700">
                  {alerts.length} milestone
                  {alerts.length === 1 ? '' : 's'} overdue
                </div>
                <ul className="mt-1.5 text-danger-700/90 space-y-1">
                  {alerts.slice(0, 3).map((a) => (
                    <li
                      key={`${a.trade.id}-${a.type}`}
                      className="flex items-center gap-2"
                    >
                      <span className="inline-block h-1 w-1 rounded-full bg-danger-400" />
                      <Link
                        to={`/trades/${a.trade.id}`}
                        className="font-mono text-[12px] font-semibold text-ink-900 hover:underline underline-offset-2"
                      >
                        {a.trade.trade_reference}
                      </Link>
                      <span className="text-[13px]">
                        {a.type === 'advance' ? '50% advance' : '50% balance'}{' '}
                        overdue by{' '}
                        <strong>
                          {a.daysOverdue} day{a.daysOverdue === 1 ? '' : 's'}
                        </strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setVersion((v) => v + 1)}
                className="btn-ghost text-danger-700 hover:bg-danger-100/60"
              >
                Re-evaluate
              </button>
            </div>
          </div>
        )}

        {/* ===== Quick Actions ===== */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingFastFlow(true);
              }}
              onDragLeave={() => setDraggingFastFlow(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDraggingFastFlow(false);
                const f = e.dataTransfer.files[0];
                if (f) onFastFlowFile(f);
              }}
              onClick={() => fastFlowInput.current?.click()}
              className={clsx(
                'group relative cursor-pointer rounded-xl border-2 border-dashed p-5 transition-all duration-200 flex items-center gap-4 overflow-hidden',
                draggingFastFlow
                  ? 'border-brand-500 bg-brand-50 scale-[1.01] shadow-elevated'
                  : 'border-ink-200 bg-white hover:border-brand-400 hover:bg-gradient-to-br hover:from-brand-50/50 hover:to-white hover:shadow-soft',
              )}
            >
              <input
                ref={fastFlowInput}
                type="file"
                accept="application/pdf"
                className="hidden"
                aria-label="Fast flow PDF upload"
                title="Fast flow PDF upload"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFastFlowFile(f);
                }}
              />
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft ring-1 ring-brand-700/20 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-[-4deg]">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13 2L3 14h7l-1 8 11-14h-7l1-6z" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                  Fast flow — drop PDF
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded">
                    Recommended
                  </span>
                </div>
                <div className="text-xs text-ink-500 mt-0.5">
                  Drag a supplier contract here to skip straight to parsing
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onDuplicateLatest}
              className="group rounded-xl border border-ink-200/80 bg-white p-5 transition-all duration-200 hover:border-ink-300 hover:shadow-soft hover:-translate-y-0.5 flex items-center gap-4 text-left"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-100 text-ink-700 transition-transform duration-200 group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 012-2h10" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink-900">
                  Create from previous
                </div>
                <div className="text-xs text-ink-500 mt-0.5">
                  Clone the most recent trade as a fresh draft
                </div>
              </div>
            </button>

            <Link
              to="/trades/new"
              className="group relative rounded-xl border border-ink-900/20 bg-gradient-to-br from-ink-900 to-ink-800 p-5 transition-all duration-200 hover:from-ink-800 hover:to-ink-700 hover:shadow-elevated hover:-translate-y-0.5 flex items-center gap-4 text-white overflow-hidden"
            >
              <div
                className="absolute inset-0 opacity-30 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(400px 200px at 80% 20%, rgba(46,144,255,0.4), transparent 60%)',
                }}
              />
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/15 text-white transition-transform duration-200 group-hover:scale-110 group-hover:rotate-90">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
              <div className="relative min-w-0">
                <div className="text-sm font-semibold">New trade</div>
                <div className="text-xs text-white/70 mt-0.5">
                  Step through the full upload + configure flow
                </div>
              </div>
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <KPICard
            label="Total Trades"
            value={totalTrades}
            hint={`${activeTrades} active`}
            tone="brand"
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7h18M3 12h18M3 17h12" strokeLinecap="round" />
              </svg>
            }
          />
          {/* Internal Team has no financial visibility — show document
              counts instead of dollar amounts (PRD §3.4 + §9.1). */}
          <KPICard
            label={isAdmin ? 'Net Profit (LTM)' : 'Documents on file'}
            value={
              isAdmin
                ? formatUSD(totalProfit)
                : trades.reduce((s, t) => s + (t.bol_date ? 1 : 0), 0) +
                  trades.length
            }
            hint={
              isAdmin
                ? `from ${formatUSD(totalSale)} in sales`
                : 'across all trade folders'
            }
            tone="success"
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17l6-6 4 4 7-7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 8h6v6" strokeLinecap="round" />
              </svg>
            }
          />
          <KPICard
            label="Pending Milestones"
            value={pendingMilestones}
            hint="advance + balance not yet received"
            tone="warning"
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" strokeLinecap="round" />
              </svg>
            }
          />
          <KPICard
            label="Overdue"
            value={overdueCount}
            hint="trades past their T+7 deadline"
            tone="danger"
            icon={
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            }
          />
        </div>

        <Card pad={false}>
          <header className="flex items-center justify-between p-5 border-b border-ink-100">
            <div>
              <h2 className="text-base font-semibold text-ink-900">
                Recent trades
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Latest activity across the desk
              </p>
            </div>
            <Link to="/trades" className="btn-ghost">View all →</Link>
          </header>

          {recent.length === 0 ? (
            <div className="p-5">
              <Empty
                title="No trades yet"
                description="Upload a Frigorífico Concepción contract PDF to generate your first mirrored sales contract."
                action={
                  isAdmin && (
                    <Link to="/trades/new" className="btn-primary">
                      Create first trade
                    </Link>
                  )
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-500">
                  <tr className="border-b border-ink-100">
                    <th className="text-left px-5 py-3 font-semibold">Trade</th>
                    <th className="text-left px-5 py-3 font-semibold">Client</th>
                    <th className="text-left px-5 py-3 font-semibold">Date</th>
                    {isAdmin && (
                      <>
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
                  {recent.map((t) => (
                    <tr
                      key={t.id}
                      className={clsx(
                        'border-b border-ink-100 last:border-0 table-row-hover',
                        t.trade_status === 'overdue' && 'bg-danger-50/40',
                        t.trade_status === 'balance_received' && 'opacity-70',
                      )}
                    >
                      <td className="px-5 py-3">
                        <Link
                          to={`/trades/${t.id}`}
                          className="font-mono text-xs font-semibold text-ink-900 hover:text-brand-600"
                        >
                          {t.trade_reference}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-ink-700">
                        {clientById.get(t.client_id) ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-ink-500">
                        {formatDate(t.contract_date)}
                      </td>
                      {isAdmin && (
                        <>
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
