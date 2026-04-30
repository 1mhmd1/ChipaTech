import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useAppStore } from './store/appStore';
import { seedIfEmpty } from './lib/seed';
import { isSupabaseEnabled } from './lib/supabase/client';
import { hydrateFromSupabase } from './lib/supabase/repos';
import { restoreSessionAsync } from './lib/auth/session';

import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { TradesListPage } from './pages/Trades/List';
import { NewTradePage } from './pages/Trades/New';
import { TradeDetailPage } from './pages/Trades/Detail';
import { ContractEditorPage } from './pages/Trades/Editor';
import { ClientsPage } from './pages/Clients';
import { ContactsPage } from './pages/Contacts';
import { EntitiesPage } from './pages/Entities';
import { UsersPage } from './pages/Users';
import { TaxExportPage } from './pages/TaxExport';
import { PartnerDashboardPage } from './pages/Partner/Dashboard';
import { PartnerTradeDetailPage } from './pages/Partner/TradeDetail';

function PrivateRoutes() {
  const user = useAppStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;

  if (user.role === 'partner') {
    return (
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/partner" element={<PartnerDashboardPage />} />
          <Route
            path="/partner/trades/:id"
            element={<PartnerTradeDetailPage />}
          />
          <Route path="*" element={<Navigate to="/partner" replace />} />
        </Route>
      </Routes>
    );
  }

  const isAdmin = user.role === 'super_admin';

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/trades" element={<TradesListPage />} />
        {isAdmin && <Route path="/trades/new" element={<NewTradePage />} />}
        {isAdmin && (
          <Route
            path="/trades/:id/editor"
            element={<ContractEditorPage />}
          />
        )}
        <Route path="/trades/:id" element={<TradeDetailPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        {isAdmin && <Route path="/contacts" element={<ContactsPage />} />}
        {isAdmin && <Route path="/entities" element={<EntitiesPage />} />}
        {isAdmin && <Route path="/users" element={<UsersPage />} />}
        {isAdmin && <Route path="/tax-export" element={<TaxExportPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function BootGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useAppStore((s) => s.refresh);
  const setUser = useAppStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        if (isSupabaseEnabled()) {
          await hydrateFromSupabase();
          const u = await restoreSessionAsync();
          if (cancelled) return;
          setUser(u);
        } else {
          seedIfEmpty();
          await restoreSessionAsync();
          refresh();
        }
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err));
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [refresh, setUser]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-ink-50">
        <div className="card card-pad max-w-md text-center">
          <div className="mx-auto h-10 w-10 rounded-full bg-danger-50 text-danger-700 flex items-center justify-center mb-3">
            !
          </div>
          <h1 className="text-base font-semibold text-ink-900">
            Couldn't reach Supabase
          </h1>
          <p className="text-sm text-ink-500 mt-1">{error}</p>
          <p className="text-xs text-ink-400 mt-3">
            Check your <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-50">
        <div className="text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-ink-200 border-t-ink-700" />
          <div className="text-sm text-ink-500">Loading workspace…</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <BootGate>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<PrivateRoutes />} />
        </Routes>
      </BootGate>
    </BrowserRouter>
  );
}

export default App;
