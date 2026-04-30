// Display helpers. The Frigorifico template uses comma-decimals
// (e.g. "2.100,000" / "56.700,00"); we normalize to JS numbers
// internally and reformat on the way out so the generated PDF
// is visually faithful.

export function formatMoney(n: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
    .format(n || 0)
    .replace(/,/g, 'X')
    .replace(/\./g, ',')
    .replace(/X/g, '.');
}

export function formatTons(n: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(n || 0)
    .replace(/,/g, 'X')
    .replace(/\./g, ',')
    .replace(/X/g, '.');
}

export function formatUnitPrice(n: number): string {
  // 4-place precision used in source contract: 2.100,000
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })
    .format(n || 0)
    .replace(/,/g, 'X')
    .replace(/\./g, ',')
    .replace(/X/g, '.');
}

export function formatUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n || 0);
}

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

export function shortRef(s: string, max = 18): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
