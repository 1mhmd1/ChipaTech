import clsx from 'clsx';
import type { ReactNode } from 'react';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'ink';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200/60',
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-success-50 text-success-700 ring-success-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-100',
  danger: 'bg-danger-50 text-danger-700 ring-danger-100',
  ink: 'bg-ink-900 text-white ring-ink-900/30',
};

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  ink: 'bg-white',
};

export function Badge({
  children,
  tone = 'neutral',
  dot,
  pulse,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'badge ring-1 ring-inset',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative inline-flex h-1.5 w-1.5">
          <span
            className={clsx(
              'inline-block h-1.5 w-1.5 rounded-full',
              DOT_CLASSES[tone],
            )}
          />
          {pulse && (
            <span
              className={clsx(
                'absolute inset-0 rounded-full animate-ping opacity-60',
                DOT_CLASSES[tone],
              )}
            />
          )}
        </span>
      )}
      {children}
    </span>
  );
}
