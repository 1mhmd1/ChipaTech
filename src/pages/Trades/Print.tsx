// =============================================================
// Print page — full-screen rendering of the HTML contract.
// Shown without AppShell chrome so the preview reflects what the
// PDF will actually look like. The toolbar at the top is the
// only screen-only chrome and is hidden during print.
// =============================================================
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  banksDB,
  clientsDB,
  contactsDB,
  entitiesDB,
  tradesDB,
} from '../../lib/storage/db';
import { ContractHTML } from '../../lib/pdf/html-contract';
import { Spinner } from '../../components/ui/Spinner';

export function PrintContractPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const trade = id ? tradesDB.byId(id) : undefined;

  useEffect(() => {
    document.title = trade
      ? `${trade.trade_reference} — Sales Contract`
      : 'Sales Contract';
    return () => {
      document.title = 'TradeMirror OS';
    };
  }, [trade]);

  if (!trade) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="card card-pad max-w-md text-center">
          <h1 className="text-base font-semibold text-ink-900">
            Trade not found
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            The trade you're trying to print may have been deleted or hasn't
            finished syncing yet.
          </p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => navigate('/trades')}
          >
            Back to trades
          </button>
        </div>
      </div>
    );
  }

  const entity = entitiesDB.byId(trade.entity_id);
  const bank = banksDB.byId(trade.bank_profile_id);
  const client = clientsDB.byId(trade.client_id);
  const contact = contactsDB.byId(trade.contact_id);

  if (!entity || !bank || !client || !contact) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="card card-pad max-w-md text-center">
          <Spinner className="h-6 w-6 mx-auto mb-3" />
          <p className="text-sm text-ink-500">
            Loading contract data… If this takes more than a few seconds,
            return to the trade and reload.
          </p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => navigate(`/trades/${trade.id}`)}
          >
            Back to trade
          </button>
        </div>
      </div>
    );
  }

  const onPrint = () => window.print();

  return (
    <div className="min-h-screen bg-ink-100">
      {/* Toolbar — hidden during print */}
      <header
        className="no-print sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur-sm"
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate(`/trades/${trade.id}/editor`)}
              className="btn-ghost"
              title="Back to editor"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
            <div className="hidden sm:block min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">
                Preview
              </div>
              <div className="text-sm font-semibold text-ink-900 truncate">
                {trade.trade_reference}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-[11px] text-ink-500">
              In the print dialog choose <strong>Save as PDF</strong> to download.
            </span>
            <button
              type="button"
              onClick={onPrint}
              className="btn-primary"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9V2h12v7" strokeLinejoin="round" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" strokeLinejoin="round" />
                <rect x="6" y="14" width="12" height="8" rx="1" />
              </svg>
              Print / Save as PDF
            </button>
          </div>
        </div>
      </header>

      {/* Document — sits on a "page" with shadow on screen, becomes plain on print */}
      <main className="py-6 sm:py-10">
        <div
          className="contract-page mx-auto bg-white shadow-elevated"
          style={{ width: '210mm', maxWidth: '100%' }}
        >
          <ContractHTML
            trade={trade}
            entity={entity}
            bank={bank}
            client={client}
            contact={contact}
          />
        </div>
      </main>
    </div>
  );
}
