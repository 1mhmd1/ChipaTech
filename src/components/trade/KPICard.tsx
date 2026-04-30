import type { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand';

const TONE_GRADIENTS: Record<Tone, string> = {
  neutral: 'from-white to-ink-50/40',
  success: 'from-success-50/60 to-white',
  warning: 'from-warning-50/60 to-white',
  danger: 'from-danger-50/60 to-white',
  brand: 'from-brand-50/60 to-white',
};

const TONE_ICONS: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-danger-100 text-danger-700',
  brand: 'bg-brand-100 text-brand-700',
};

const TONE_RING: Record<Tone, string> = {
  neutral: 'ring-ink-100',
  success: 'ring-success-100',
  warning: 'ring-warning-100',
  danger: 'ring-danger-100',
  brand: 'ring-brand-100',
};

export function KPICard({
  label,
  value,
  hint,
  trend,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  trend?: { delta: string; positive?: boolean };
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div
      className={clsx(
        'group relative rounded-xl border border-ink-200/70 bg-gradient-to-br p-5 shadow-soft',
        'transition-all duration-200 hover:shadow-elevated hover:-translate-y-0.5',
        TONE_GRADIENTS[tone],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ink-500">
          {label}
        </div>
        {icon && (
          <div
            className={clsx(
              'rounded-lg p-1.5 ring-1 transition-transform duration-200 group-hover:scale-110',
              TONE_ICONS[tone],
              TONE_RING[tone],
            )}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="mt-3 display-num text-[26px] leading-none">{value}</div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {trend && (
          <span
            className={clsx(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold',
              trend.positive
                ? 'bg-success-50 text-success-700'
                : 'bg-danger-50 text-danger-700',
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              {trend.positive ? (
                <path d="M5 15l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M5 9l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
            {trend.delta}
          </span>
        )}
        {hint && <span className="text-ink-500">{hint}</span>}
      </div>
    </div>
  );
}
