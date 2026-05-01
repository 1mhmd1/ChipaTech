// Shared warning helpers for the Contract Editor

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
      description:
        'Total costs exceed sale total — review pricing or reduce shipping/insurance/fees.',
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
      description:
        'Cargo insurance is typically 0.1-0.3% of sale total. Add it before generating the final contract.',
    });
  }
  if (i.bankFees === 0) {
    out.push({
      level: 'info',
      title: 'No bank fees recorded',
      description:
        'Wire-transfer fees and intermediary bank charges add up. Estimate now to avoid net-profit surprises.',
    });
  }
  return out;
}
