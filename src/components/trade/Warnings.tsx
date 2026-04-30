// Smart validation surfaced in the Contract Editor sidebar.
// Loud-but-not-blocking: warnings flag risky state, suggestions
// nudge for missing inputs.

export interface WarningInputs {
  saleUnitPrice: number;
  frigoUnitPrice: number;
  saleTotal: number;
  netProfit: number;
  marginPct: number;
  shipping: number;
  insurance: number;
  bankFees: number;
}

export interface WarningItem {
  level: 'danger' | 'warning' | 'info';
  title: string;
  description: string;
}

export function buildWarnings(i: WarningInputs): WarningItem[] {
  const out: WarningItem[] = [];

  if (i.saleTotal > 0 && i.saleUnitPrice < i.frigoUnitPrice) {
    out.push({
      level: 'danger',
      title: 'Sale price below purchase price',
      description: `You're selling at $${i.saleUnitPrice.toFixed(2)}/t but buying from Frigo at $${i.frigoUnitPrice.toFixed(2)}/t. This trade is structurally a loss.`,
    });
  }
  if (i.saleTotal > 0 && i.netProfit < 0) {
    out.push({
      level: 'danger',
      title: 'Net profit is negative',
      description: 'Total costs exceed sale total — review pricing or reduce shipping/insurance/fees.',
    });
  } else if (i.saleTotal > 0 && i.marginPct < 5) {
    out.push({
      level: 'warning',
      title: 'Low margin trade',
      description: `Margin is ${i.marginPct.toFixed(1)}% — well below the 8-12% range typical for this product. Consider a higher unit price.`,
    });
  }
  if (i.shipping === 0) {
    out.push({
      level: 'info',
      title: 'No shipping cost entered',
      description:
        'Are you sure you have captured all costs? Freight is usually billed separately on CFR contracts.',
    });
  }
  if (i.insurance === 0) {
    out.push({
      level: 'info',
      title: 'No insurance cost entered',
      description: 'Cargo insurance is typically 0.1-0.3% of sale total. Add it before generating the final contract.',
    });
  }
  if (i.bankFees === 0) {
    out.push({
      level: 'info',
      title: 'No bank fees recorded',
      description: 'Wire-transfer fees and intermediary bank charges add up. Estimate now to avoid net-profit surprises.',
    });
  }
  return out;
}

const LEVEL_STYLES = {
  danger: 'border-danger-200 bg-danger-50 text-danger-700',
  warning: 'border-warning-200 bg-warning-50 text-warning-700',
  info: 'border-ink-200 bg-ink-50 text-ink-700',
} as const;

const LEVEL_ICONS = {
  danger: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinejoin="round" />
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  ),
} as const;

export function WarningsList({ items }: { items: WarningItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-success-200 bg-success-50 px-3 py-2.5 text-xs text-success-700 flex items-start gap-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="font-semibold">All checks passed</div>
          <div className="opacity-80">No issues detected with this trade.</div>
        </div>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li
          key={i}
          className={`rounded-lg border ${LEVEL_STYLES[it.level]} px-3 py-2.5 text-xs flex items-start gap-2`}
        >
          <span className="mt-0.5 shrink-0">{LEVEL_ICONS[it.level]}</span>
          <div className="min-w-0">
            <div className="font-semibold">{it.title}</div>
            <div className="opacity-80 mt-0.5">{it.description}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
