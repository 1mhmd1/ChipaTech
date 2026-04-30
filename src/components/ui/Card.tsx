import { type HTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  pad?: boolean;
}

export function Card({ children, className, pad = true, ...rest }: CardProps) {
  return (
    <div
      className={clsx('card', pad && 'card-pad', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, actions, children, className }: SectionProps) {
  return (
    <section className={clsx('mb-8', className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-end justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-ink-900">{title}</h2>}
            {description && (
              <p className="text-sm text-ink-500 mt-0.5">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
