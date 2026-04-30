import clsx from 'clsx';
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  required,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-danger-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input(
  props: InputHTMLAttributes<HTMLInputElement> & { locked?: boolean },
) {
  const { locked, className, ...rest } = props;
  return (
    <input
      {...rest}
      readOnly={locked || rest.readOnly}
      className={clsx('input', locked && 'field-locked', className)}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={clsx('input', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={clsx('input min-h-[80px]', props.className)} />;
}

export function LockedField({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="input field-locked flex items-center justify-between">
        <span className="truncate">{value || <em className="text-ink-400">—</em>}</span>
        <svg
          className="h-4 w-4 text-ink-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 17a2 2 0 100-4 2 2 0 000 4z" />
          <path d="M5 11V7a7 7 0 0114 0v4" />
          <rect x="4" y="11" width="16" height="10" rx="2" />
        </svg>
      </div>
    </Field>
  );
}
