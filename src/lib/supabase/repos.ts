// ============================================================
// Supabase repositories with an in-memory cache
//
// Pattern: hydrate-then-cache. At app startup we load every
// table into memory; reads stay synchronous (so existing
// components don't change), writes update the cache
// synchronously and fire off persistence in the background.
// For an internal ERP this is the right tradeoff — fast UI,
// real backend persistence, no async refactor of every page.
// ============================================================

import type {
  ActivityEvent,
  BankProfile,
  Client,
  Contact,
  DocumentType,
  Entity,
  Trade,
  TradeDocument,
  User,
} from '../../types';
import { getSupabase, isSupabaseEnabled, SUPABASE_BUCKET } from './client';

interface Caches {
  users: User[];
  entities: Entity[];
  bank_profiles: BankProfile[];
  clients: Client[];
  contacts: Contact[];
  trades: Trade[];
  documents: TradeDocument[];
  activity: ActivityEvent[];
}

const cache: Caches = {
  users: [],
  entities: [],
  bank_profiles: [],
  clients: [],
  contacts: [],
  trades: [],
  documents: [],
  activity: [],
};

let hydrated = false;
let hydratePromise: Promise<void> | null = null;

export function isHydrated() {
  return hydrated;
}

export function resetHydration() {
  hydrated = false;
  hydratePromise = null;
}

export async function hydrateFromSupabase(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    const sb = getSupabase();
    const [users, entities, banks, clients, contacts, trades, docs, activity] =
      await Promise.all([
        sb.from('users').select('*'),
        sb.from('entities').select('*'),
        sb.from('bank_profiles').select('*'),
        sb.from('clients').select('*'),
        sb.from('contacts').select('*'),
        sb.from('trades').select('*'),
        sb.from('documents').select('*'),
        sb.from('activity').select('*'),
      ]);
    cache.users = (users.data ?? []) as User[];
    cache.entities = (entities.data ?? []) as Entity[];
    cache.bank_profiles = (banks.data ?? []) as BankProfile[];
    cache.clients = (clients.data ?? []) as Client[];
    cache.contacts = (contacts.data ?? []) as Contact[];
    cache.trades = (trades.data ?? []) as Trade[];
    cache.documents = (docs.data ?? []) as TradeDocument[];
    cache.activity = (activity.data ?? []) as ActivityEvent[];
    hydrated = true;
  })();

  return hydratePromise;
}

// ----- Sync cache accessors (sync reads) -----
export const supaCache = {
  users: () => cache.users,
  entities: () => cache.entities,
  banks: () => cache.bank_profiles,
  clients: () => cache.clients,
  contacts: () => cache.contacts,
  trades: () => cache.trades,
  documents: () => cache.documents,
  activity: () => cache.activity,
};

// ----- Sync cache mutations -----
export function cacheUpsert<T extends keyof Caches>(
  table: T,
  row: Caches[T][number],
) {
  const arr = cache[table] as Array<{ id: string }>;
  const idx = arr.findIndex((r) => r.id === (row as { id: string }).id);
  if (idx >= 0) arr[idx] = row as { id: string };
  else arr.push(row as { id: string });
}
export function cacheRemove(table: keyof Caches, id: string) {
  // Replace the array contents in-place to avoid the union type
  // mismatch you'd hit by reassigning cache[table].
  const arr = cache[table] as Array<{ id: string }>;
  const filtered = arr.filter((r) => r.id !== id);
  arr.length = 0;
  arr.push(...filtered);
}
export function cacheRemoveWhere<T extends keyof Caches>(
  table: T,
  predicate: (row: Caches[T][number]) => boolean,
) {
  const arr = cache[table] as Array<{ id: string }>;
  const filtered = arr.filter((r) => !predicate(r as Caches[T][number]));
  arr.length = 0;
  arr.push(...filtered);
}

// ----- Background persistence -----
function reportError(op: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[Supabase ${op} failed]`, err);
}

export function persistUpsert<T extends { id: string }>(
  table: keyof Caches,
  row: T,
) {
  if (!isSupabaseEnabled()) return;
  void (async () => {
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from(table as string)
        .upsert(row as Record<string, unknown>);
      if (error) throw error;
    } catch (err) {
      reportError(`upsert ${String(table)}`, err);
    }
  })();
}
export function persistRemove(table: keyof Caches, id: string) {
  if (!isSupabaseEnabled()) return;
  void (async () => {
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from(table as string)
        .delete()
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      reportError(`delete ${String(table)}`, err);
    }
  })();
}
export function persistRemoveWhere(
  table: keyof Caches,
  ids: string[],
) {
  if (!isSupabaseEnabled() || ids.length === 0) return;
  void (async () => {
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from(table as string)
        .delete()
        .in('id', ids);
      if (error) throw error;
    } catch (err) {
      reportError(`delete-where ${String(table)}`, err);
    }
  })();
}

// ----- Storage helpers -----
export async function uploadDocument(
  tradeId: string,
  type: DocumentType,
  file: Blob | Uint8Array,
  fileName: string,
  contentType = 'application/pdf',
): Promise<string> {
  const sb = getSupabase();
  const path = `${tradeId}/${type}/${Date.now()}-${fileName}`;
  const { error } = await sb.storage
    .from(SUPABASE_BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

export async function downloadDocument(path: string): Promise<Uint8Array> {
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(SUPABASE_BUCKET).download(path);
  if (error || !data) throw error ?? new Error('Download failed');
  return new Uint8Array(await data.arrayBuffer());
}

export async function publicDocumentUrl(path: string): Promise<string> {
  const sb = getSupabase();
  const { data } = await sb.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? '';
}
