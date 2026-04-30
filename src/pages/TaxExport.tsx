// ============================================================
// Tax Readiness Export — PRD §12.2
//
// Annual export for CPA use. Per the PRD this is SuperAdmin-only,
// must include each trade row's: Trade ID, Date of Contract,
// Client, Country, Active Entity at time of trade (EAS or LLC),
// Frigo Purchase Price, Sale Total, Shipping/Insurance/Bank Fees
// itemized, Net Profit, Income Classification "Foreign Sourced
// Income (Non-US)". Trades are flagged by entity period to
// simplify IRS Form 5472 / 1065 prep.
// ============================================================

import { useMemo, useState } from 'react';
import { PageBody, PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select } from '../components/ui/Field';
import { Empty } from '../components/ui/Empty';
import { Badge } from '../components/ui/Badge';
import {
  clientsDB,
  entitiesDB,
  tradesDB,
} from '../lib/storage/db';
import { formatDate, formatUSD } from '../lib/format';
import type { Trade } from '../types';

type Period = 'all' | 'eas' | 'llc';

interface TaxRow {
  trade_id: string;
  trade_reference: string;
  contract_date: string;
  client_name: string;
  client_country: string;
  active_entity: string;
  entity_period: 'EAS' | 'LLC' | 'OTHER';
  frigo_purchase_price: number;
  sale_total: number;
  shipping_cost: number;
  insurance_cost: number;
  bank_fees: number;
  net_profit: number;
  income_classification: string;
}

function entityPeriod(entityName: string | undefined): TaxRow['entity_period'] {
  if (!entityName) return 'OTHER';
  if (/llc|farm/i.test(entityName)) return 'LLC';
  if (/eas|tech/i.test(entityName)) return 'EAS';
  return 'OTHER';
}

function buildRow(trade: Trade): TaxRow {
  const entity = entitiesDB.byId(trade.entity_id);
  const client = clientsDB.byId(trade.client_id);
  return {
    trade_id: trade.trade_reference,
    trade_reference: trade.trade_reference,
    contract_date: trade.contract_date,
    client_name: client?.company_name ?? '—',
    client_country: client?.country ?? '—',
    active_entity: entity?.name ?? '—',
    entity_period: entityPeriod(entity?.name),
    frigo_purchase_price: trade.frigo_total,
    sale_total: trade.sale_total,
    shipping_cost: trade.shipping_cost,
    insurance_cost: trade.insurance_cost,
    bank_fees: trade.bank_fees,
    net_profit: trade.net_profit,
    income_classification: 'Foreign Sourced Income (Non-US)',
  };
}

function toCSV(rows: TaxRow[]): string {
  const headers = [
    'Trade ID',
    'Date of Contract',
    'Client Name',
    'Client Country',
    'Active Entity',
    'Entity Period',
    'Frigo Purchase Price (USD)',
    'Sale Total (USD)',
    'Shipping (USD)',
    'Insurance (USD)',
    'Bank Fees (USD)',
    'Net Profit (USD)',
    'Income Classification',
  ];
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [
      r.trade_id,
      r.contract_date.slice(0, 10),
      r.client_name,
      r.client_country,
      r.active_entity,
      r.entity_period,
      r.frigo_purchase_price.toFixed(2),
      r.sale_total.toFixed(2),
      r.shipping_cost.toFixed(2),
      r.insurance_cost.toFixed(2),
      r.bank_fees.toFixed(2),
      r.net_profit.toFixed(2),
      r.income_classification,
    ]
      .map(escape)
      .join(','),
  );
  return [headers.join(','), ...lines].join('\n');
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TaxExportPage() {
  const [period, setPeriod] = useState<Period>('all');
  const [year, setYear] = useState<'all' | number>('all');

  const allRows = useMemo(
    () => tradesDB.list().map(buildRow),
    [],
  );

  const years = useMemo(() => {
    const set = new Set<number>();
    allRows.forEach((r) => set.add(new Date(r.contract_date).getFullYear()));
    return [...set].sort((a, b) => b - a);
  }, [allRows]);

  const filtered = allRows.filter((r) => {
    if (period === 'eas' && r.entity_period !== 'EAS') return false;
    if (period === 'llc' && r.entity_period !== 'LLC') return false;
    if (year !== 'all') {
      const y = new Date(r.contract_date).getFullYear();
      if (y !== year) return false;
    }
    return true;
  });

  const totals = filtered.reduce(
    (acc, r) => ({
      frigo: acc.frigo + r.frigo_purchase_price,
      sale: acc.sale + r.sale_total,
      shipping: acc.shipping + r.shipping_cost,
      insurance: acc.insurance + r.insurance_cost,
      fees: acc.fees + r.bank_fees,
      profit: acc.profit + r.net_profit,
    }),
    { frigo: 0, sale: 0, shipping: 0, insurance: 0, fees: 0, profit: 0 },
  );

  const onDownloadCsv = () => {
    const csv = toCSV(filtered);
    const suffix =
      year === 'all' ? 'all-years' : String(year);
    const periodLabel =
      period === 'all' ? 'all-entities' : period.toUpperCase();
    downloadFile(
      `tradeMirror-tax-readiness-${suffix}-${periodLabel}.csv`,
      csv,
      'text/csv',
    );
  };

  const onDownloadJson = () => {
    // JSON variant — useful if the CPA wants to re-import to their tooling
    downloadFile(
      `tradeMirror-tax-readiness-${year}.json`,
      JSON.stringify(filtered, null, 2),
      'application/json',
    );
  };

  return (
    <>
      <PageHeader
        title="Tax Readiness Export"
        description="Annual export for CPA use — formatted to simplify IRS Form 5472 / 1065 prep"
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={onDownloadJson}
              disabled={filtered.length === 0}
            >
              Download JSON
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onDownloadCsv}
              disabled={filtered.length === 0}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Download CSV
            </button>
          </>
        }
      />
      <PageBody>
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Entity period" hint="EAS = Paraguay, LLC = USA">
              <Select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
              >
                <option value="all">All entities</option>
                <option value="llc">LLC period only (Wyoming)</option>
                <option value="eas">EAS period only (Paraguay)</option>
              </Select>
            </Field>
            <Field label="Tax year">
              <Select
                value={year === 'all' ? 'all' : String(year)}
                onChange={(e) =>
                  setYear(
                    e.target.value === 'all'
                      ? 'all'
                      : parseInt(e.target.value, 10),
                  )
                }
              >
                <option value="all">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <div className="label">Selection</div>
              <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm">
                <strong>{filtered.length}</strong> trade
                {filtered.length === 1 ? '' : 's'} match the filters
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Frigo cost" value={formatUSD(totals.frigo)} />
          <Stat label="Sale total" value={formatUSD(totals.sale)} />
          <Stat label="Shipping + Insurance + Fees" value={formatUSD(totals.shipping + totals.insurance + totals.fees)} />
          <Stat
            label="Net profit"
            value={formatUSD(totals.profit)}
            tone={totals.profit >= 0 ? 'success' : 'danger'}
          />
        </div>

        <Card pad={false} className="mt-6">
          <header className="p-5 border-b border-ink-100">
            <h2 className="text-base font-semibold text-ink-900">Preview</h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Income classification: <strong>Foreign Sourced Income (Non-US)</strong>
            </p>
          </header>
          {filtered.length === 0 ? (
            <div className="p-5">
              <Empty
                title="No trades match the filters"
                description="Adjust the entity period or tax year to widen the selection."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-ink-500">
                  <tr className="border-b border-ink-100">
                    <th className="text-left px-4 py-3 font-semibold">Trade</th>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Client</th>
                    <th className="text-left px-4 py-3 font-semibold">Period</th>
                    <th className="text-right px-4 py-3 font-semibold">Frigo</th>
                    <th className="text-right px-4 py-3 font-semibold">Sale</th>
                    <th className="text-right px-4 py-3 font-semibold">Shipping</th>
                    <th className="text-right px-4 py-3 font-semibold">Insurance</th>
                    <th className="text-right px-4 py-3 font-semibold">Fees</th>
                    <th className="text-right px-4 py-3 font-semibold">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.trade_id}
                      className="border-b border-ink-100 last:border-0"
                    >
                      <td className="px-4 py-2.5 font-mono">{r.trade_reference}</td>
                      <td className="px-4 py-2.5 text-ink-500">{formatDate(r.contract_date)}</td>
                      <td className="px-4 py-2.5">{r.client_name}<div className="text-[10px] text-ink-400">{r.client_country}</div></td>
                      <td className="px-4 py-2.5">
                        <Badge tone={r.entity_period === 'LLC' ? 'brand' : r.entity_period === 'EAS' ? 'warning' : 'neutral'}>
                          {r.entity_period}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatUSD(r.frigo_purchase_price)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatUSD(r.sale_total)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{formatUSD(r.shipping_cost)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{formatUSD(r.insurance_cost)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-500">{formatUSD(r.bank_fees)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className={r.net_profit >= 0 ? 'text-success-700 font-semibold' : 'text-danger-600 font-semibold'}>
                          {formatUSD(r.net_profit)}
                        </span>
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

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  return (
    <div className="card card-pad">
      <div className="text-xs uppercase tracking-wide text-ink-500 font-semibold">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === 'success'
            ? 'text-success-700'
            : tone === 'danger'
              ? 'text-danger-600'
              : 'text-ink-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
