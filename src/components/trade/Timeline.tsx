import type { ActivityEvent } from '../../types';
import { formatDateTime } from '../../lib/format';

const ICONS: Record<ActivityEvent['type'], React.ReactNode> = {
  trade_created: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  contract_generated: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 3H8a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V7l-4-4z" strokeLinejoin="round" />
      <path d="M14 3v4h4" />
      <path d="M9 13l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  contract_sent: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinejoin="round" />
    </svg>
  ),
  document_uploaded: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  status_changed: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  milestone_received: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  milestone_overdue: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M3 12h18M3 18h12" strokeLinecap="round" />
    </svg>
  ),
};

const TONES: Record<ActivityEvent['type'], string> = {
  trade_created: 'bg-ink-100 text-ink-700',
  contract_generated: 'bg-brand-50 text-brand-700',
  contract_sent: 'bg-brand-50 text-brand-700',
  document_uploaded: 'bg-ink-100 text-ink-600',
  status_changed: 'bg-warning-50 text-warning-700',
  milestone_received: 'bg-success-50 text-success-700',
  milestone_overdue: 'bg-danger-50 text-danger-700',
  note: 'bg-ink-100 text-ink-500',
};

export function Timeline({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-4 py-5 text-sm text-ink-500">No activity yet.</p>
    );
  }
  return (
    <ol className="p-4 space-y-4">
      {events.map((e, idx) => (
        <li key={e.id} className="relative flex gap-3">
          <div className="relative flex flex-col items-center">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full ${TONES[e.type]}`}
            >
              {ICONS[e.type]}
            </div>
            {idx < events.length - 1 && (
              <div className="absolute top-7 bottom-[-16px] w-px bg-ink-100" />
            )}
          </div>
          <div className="flex-1 pb-1 min-w-0">
            <div className="text-sm text-ink-800 leading-snug">
              {e.message}
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              {formatDateTime(e.created_at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
