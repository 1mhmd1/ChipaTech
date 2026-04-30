// ============================================================
// Storage abstraction. The whole app talks to this module.
// Two backends share the same sync interface:
//
//   • localStorage (default — demo / offline / no env vars)
//   • Supabase     (when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set)
//
// In Supabase mode, reads come from an in-memory cache that's
// hydrated at app startup; writes update the cache synchronously
// and persist to Supabase in the background. This keeps the
// existing component code unchanged.
// ============================================================

import type {
  ActivityEvent,
  BankProfile,
  Client,
  Contact,
  Entity,
  Trade,
  TradeDocument,
  User,
} from '../../types';
import { isSupabaseEnabled } from '../supabase/client';
import {
  cacheRemove,
  cacheRemoveWhere,
  cacheUpsert,
  persistRemove,
  persistRemoveWhere,
  persistUpsert,
  supaCache,
} from '../supabase/repos';

const NS = 'tm_os.v1';

type TableMap = {
  users: User;
  entities: Entity;
  bank_profiles: BankProfile;
  clients: Client;
  contacts: Contact;
  trades: Trade;
  documents: TradeDocument;
  activity: ActivityEvent;
};

type TableName = keyof TableMap;

function key(table: TableName) {
  return `${NS}.${table}`;
}

function localList<T extends TableName>(table: T): TableMap[T][] {
  const raw = localStorage.getItem(key(table));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as TableMap[T][];
  } catch {
    return [];
  }
}

function localWrite<T extends TableName>(table: T, rows: TableMap[T][]) {
  localStorage.setItem(key(table), JSON.stringify(rows));
}

function readTable<T extends TableName>(table: T): TableMap[T][] {
  if (isSupabaseEnabled()) {
    switch (table) {
      case 'users':
        return supaCache.users() as TableMap[T][];
      case 'entities':
        return supaCache.entities() as TableMap[T][];
      case 'bank_profiles':
        return supaCache.banks() as TableMap[T][];
      case 'clients':
        return supaCache.clients() as TableMap[T][];
      case 'contacts':
        return supaCache.contacts() as TableMap[T][];
      case 'trades':
        return supaCache.trades() as TableMap[T][];
      case 'documents':
        return supaCache.documents() as TableMap[T][];
      case 'activity':
        return supaCache.activity() as TableMap[T][];
    }
  }
  return localList(table);
}

function writeRow<T extends TableName>(table: T, row: TableMap[T]) {
  if (isSupabaseEnabled()) {
    cacheUpsert(table, row);
    persistUpsert(table, row as { id: string });
  } else {
    const rows = localList(table);
    const idx = rows.findIndex(
      (r) => (r as { id: string }).id === (row as { id: string }).id,
    );
    if (idx >= 0) rows[idx] = row;
    else rows.push(row);
    localWrite(table, rows);
  }
}

function deleteRow(table: TableName, id: string): boolean {
  if (isSupabaseEnabled()) {
    cacheRemove(table, id);
    persistRemove(table, id);
    return true;
  }
  const rows = localList(table);
  const filtered = rows.filter((r) => (r as { id: string }).id !== id);
  if (filtered.length === rows.length) return false;
  localWrite(table, filtered);
  return true;
}

export function uid(prefix = ''): string {
  const random = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}${prefix ? '_' : ''}${ts}${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const db = {
  list<T extends TableName>(table: T): TableMap[T][] {
    return readTable(table);
  },
  getById<T extends TableName>(table: T, id: string): TableMap[T] | undefined {
    return readTable(table).find((r) => (r as { id: string }).id === id);
  },
  insert<T extends TableName>(table: T, row: TableMap[T]): TableMap[T] {
    writeRow(table, row);
    return row;
  },
  update<T extends TableName>(
    table: T,
    id: string,
    patch: Partial<TableMap[T]>,
  ): TableMap[T] | undefined {
    const existing = readTable(table).find(
      (r) => (r as { id: string }).id === id,
    );
    if (!existing) return undefined;
    const merged = { ...existing, ...patch } as TableMap[T];
    writeRow(table, merged);
    return merged;
  },
  remove<T extends TableName>(table: T, id: string): boolean {
    return deleteRow(table, id);
  },
  removeWhere<T extends TableName>(
    table: T,
    predicate: (row: TableMap[T]) => boolean,
  ) {
    if (isSupabaseEnabled()) {
      const ids = readTable(table)
        .filter((r) => predicate(r))
        .map((r) => (r as { id: string }).id);
      cacheRemoveWhere(table, predicate as (r: unknown) => boolean);
      persistRemoveWhere(table, ids);
      return;
    }
    const rows = localList(table);
    localWrite(
      table,
      rows.filter((r) => !predicate(r)),
    );
  },
  reset() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(NS))
      .forEach((k) => localStorage.removeItem(k));
  },
  bumpVersion() {
    // for migrations
  },
};

// ---------- typed shortcuts ----------
export const usersDB = {
  list: () => db.list('users'),
  byId: (id: string) => db.getById('users', id),
  byEmail: (email: string) =>
    db.list('users').find((u) => u.email.toLowerCase() === email.toLowerCase()),
  insert: (u: User) => db.insert('users', u),
  update: (id: string, patch: Partial<User>) => db.update('users', id, patch),
  remove: (id: string) => db.remove('users', id),
};

export const entitiesDB = {
  list: () => db.list('entities'),
  byId: (id: string) => db.getById('entities', id),
  insert: (e: Entity) => db.insert('entities', e),
  update: (id: string, patch: Partial<Entity>) =>
    db.update('entities', id, patch),
  remove: (id: string) => db.remove('entities', id),
};

export const banksDB = {
  list: () => db.list('bank_profiles'),
  byId: (id: string) => db.getById('bank_profiles', id),
  byEntity: (entity_id: string) =>
    db.list('bank_profiles').filter((b) => b.entity_id === entity_id),
  defaultFor: (entity_id: string) =>
    db
      .list('bank_profiles')
      .find((b) => b.entity_id === entity_id && b.is_default) ??
    db.list('bank_profiles').find((b) => b.entity_id === entity_id),
  insert: (b: BankProfile) => db.insert('bank_profiles', b),
  update: (id: string, patch: Partial<BankProfile>) =>
    db.update('bank_profiles', id, patch),
  remove: (id: string) => db.remove('bank_profiles', id),
};

export const clientsDB = {
  list: () => db.list('clients'),
  byId: (id: string) => db.getById('clients', id),
  insert: (c: Client) => db.insert('clients', c),
  update: (id: string, patch: Partial<Client>) =>
    db.update('clients', id, patch),
  remove: (id: string) => db.remove('clients', id),
};

export const contactsDB = {
  list: () => db.list('contacts'),
  byId: (id: string) => db.getById('contacts', id),
  default: () =>
    db.list('contacts').find((c) => c.is_default) ?? db.list('contacts')[0],
  insert: (c: Contact) => db.insert('contacts', c),
  update: (id: string, patch: Partial<Contact>) =>
    db.update('contacts', id, patch),
  remove: (id: string) => db.remove('contacts', id),
};

export const tradesDB = {
  list: () =>
    db
      .list('trades')
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
  byId: (id: string) => db.getById('trades', id),
  insert: (t: Trade) => db.insert('trades', t),
  update: (id: string, patch: Partial<Trade>) => db.update('trades', id, patch),
  remove: (id: string) => {
    db.remove('trades', id);
    db.removeWhere('documents', (d) => d.trade_id === id);
    db.removeWhere('activity', (a) => a.trade_id === id);
  },
  nextReference: () => {
    const year = new Date().getFullYear();
    const sameYear = db
      .list('trades')
      .filter((t) => t.trade_reference.includes(`CF-${year}`));
    const num = (sameYear.length + 1).toString().padStart(3, '0');
    return `CF-${year}-${num}`;
  },
};

export const docsDB = {
  list: () => db.list('documents'),
  byTrade: (trade_id: string) =>
    db.list('documents').filter((d) => d.trade_id === trade_id),
  insert: (d: TradeDocument) => db.insert('documents', d),
  remove: (id: string) => db.remove('documents', id),
};

export const activityDB = {
  list: () => db.list('activity'),
  byTrade: (trade_id: string) =>
    db
      .list('activity')
      .filter((a) => a.trade_id === trade_id)
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
  insert: (a: ActivityEvent) => db.insert('activity', a),
};

export function logActivity(
  trade_id: string,
  type: ActivityEvent['type'],
  message: string,
  meta?: Record<string, unknown>,
  actor_id?: string,
) {
  activityDB.insert({
    id: uid('act'),
    trade_id,
    type,
    message,
    meta,
    actor_id,
    created_at: nowIso(),
  });
}

// Clone a trade as a fresh draft and copy the supplier PDF so the
// editor can regenerate. Caller decides which client/contact apply.
export function duplicateTrade(
  sourceId: string,
  actorId: string,
  overrides: Partial<{
    client_id: string;
    contact_id: string;
    entity_id: string;
    bank_profile_id: string;
  }> = {},
): import('../../types').Trade | null {
  const src = tradesDB.byId(sourceId);
  if (!src) return null;

  const newId = uid('trd');
  const now = nowIso();
  const reference = tradesDB.nextReference();

  const clone: import('../../types').Trade = {
    ...src,
    id: newId,
    trade_reference: reference,
    client_id: overrides.client_id ?? src.client_id,
    contact_id: overrides.contact_id ?? src.contact_id,
    entity_id: overrides.entity_id ?? src.entity_id,
    bank_profile_id: overrides.bank_profile_id ?? src.bank_profile_id,
    contract_date: now,
    signing_date: undefined,
    bol_date: undefined,
    advance_status: 'pending',
    advance_received_at: undefined,
    advance_due_date: undefined,
    balance_status: 'pending',
    balance_received_at: undefined,
    balance_due_date: undefined,
    trade_status: 'draft',
    shipping_cost: 0,
    insurance_cost: 0,
    bank_fees: 0,
    total_costs: src.frigo_total,
    net_profit: src.sale_total - src.frigo_total,
    created_at: now,
    updated_at: now,
  };
  tradesDB.insert(clone);

  // Copy original supplier PDF only — generated/signed/BOL docs
  // belong to the original deal.
  const sourcePdf = docsDB
    .byTrade(sourceId)
    .find((d) => d.document_type === 'frigo_contract');
  if (sourcePdf) {
    docsDB.insert({
      id: uid('doc'),
      trade_id: newId,
      document_type: 'frigo_contract',
      file_name: sourcePdf.file_name,
      storage_path: sourcePdf.storage_path,
      uploaded_by: actorId,
      uploaded_at: now,
    });
  }

  logActivity(
    newId,
    'trade_created',
    `Duplicated from ${src.trade_reference}`,
    { source_trade_id: sourceId },
    actorId,
  );

  return clone;
}
