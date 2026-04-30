import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="glass border-b border-ink-200/60 sticky top-0 z-20 md:top-0">
      <div className="px-4 py-4 sm:px-8 sm:py-5">
        {breadcrumb && (
          <div className="text-[11px] uppercase tracking-[0.08em] text-ink-400 mb-1.5 font-medium">
            {breadcrumb}
          </div>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display-1 leading-tight">{title}</h1>
            {description && (
              <p className="text-sm text-ink-500 mt-1">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </div>
      </div>
    </header>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 py-4 sm:px-6 sm:py-6 animate-in ${className ?? ''}`}>{children}</div>
  );
}
