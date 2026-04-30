-- =============================================================
-- TradeMirror OS — initial schema
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Mirrors §14 of the PRD, with RLS enforcing the role matrix
-- (super_admin, internal, partner) from §3.4.
-- =============================================================

-- ----- Extensions -----
create extension if not exists pgcrypto;

-- ----- Enums -----
do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('super_admin','internal','partner');
  end if;
  if not exists (select 1 from pg_type where typname = 'milestone_status') then
    create type milestone_status as enum ('pending','received','overdue');
  end if;
  if not exists (select 1 from pg_type where typname = 'trade_status') then
    create type trade_status as enum ('draft','active','advance_received','shipped','balance_received','overdue');
  end if;
  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type document_type as enum ('frigo_contract','sales_contract','signed_contract','bol','other');
  end if;
end $$;

-- ----- Tables -----

-- One row per app user. PK matches auth.users.id so we can join on it.
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role user_role not null default 'internal',
  is_active boolean not null default true,
  invited_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  ruc_ein text,
  address text,
  city text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_profiles (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities(id) on delete cascade,
  profile_name text not null,
  beneficiary_name text not null,
  beneficiary_address text,
  intermediary_bank_name text,
  intermediary_bank_swift text,
  intermediary_account_number text,
  intermediary_location text,
  bank_name text not null,
  bank_swift text not null,
  account_number text not null,
  ara_number text,
  field_71a text not null default 'OUR',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_profiles_entity on public.bank_profiles(entity_id);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  address text,
  city text,
  country text not null,
  tax_id text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_clients_country on public.clients(country);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  role text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  trade_reference text not null unique,

  entity_id uuid not null references public.entities(id),
  bank_profile_id uuid not null references public.bank_profiles(id),
  client_id uuid not null references public.clients(id),
  contact_id uuid not null references public.contacts(id),

  contract_date timestamptz not null,
  signing_date timestamptz,
  bol_date timestamptz,

  frigo_contract_ref text,
  quantity_tons numeric not null,
  product_description text not null,

  frigo_unit_price numeric not null default 0,
  frigo_total numeric not null default 0,
  sale_unit_price numeric not null default 0,
  sale_total numeric not null default 0,
  shipping_cost numeric not null default 0,
  insurance_cost numeric not null default 0,
  bank_fees numeric not null default 0,
  total_costs numeric not null default 0,
  net_profit numeric not null default 0,

  brand text,
  validity text,
  temperature text,
  packing text,
  shipment_date text,
  origin text,
  destination text,
  incoterm text,
  plant_no text,
  freight_condition text,
  observations text,
  prepayment_condition text,
  balance_condition text,

  advance_status milestone_status not null default 'pending',
  advance_received_at timestamptz,
  advance_due_date timestamptz,
  balance_status milestone_status not null default 'pending',
  balance_received_at timestamptz,
  balance_due_date timestamptz,

  trade_status trade_status not null default 'draft',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trades_status on public.trades(trade_status);
create index if not exists idx_trades_client on public.trades(client_id);
create index if not exists idx_trades_created on public.trades(created_at desc);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  document_type document_type not null,
  file_name text not null,
  storage_path text not null,
  uploaded_by uuid references public.users(id),
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_documents_trade on public.documents(trade_id);

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  type text not null,
  message text not null,
  meta jsonb,
  actor_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_activity_trade on public.activity(trade_id, created_at desc);

-- =============================================================
-- Row Level Security
-- =============================================================

alter table public.users enable row level security;
alter table public.entities enable row level security;
alter table public.bank_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.trades enable row level security;
alter table public.documents enable row level security;
alter table public.activity enable row level security;

-- Helper: returns the role of the calling user (or null if not signed in).
create or replace function public.current_role()
returns user_role
language sql
security definer
stable
as $$
  select role from public.users where id = auth.uid();
$$;

-- Helper: returns true if the calling user is a super_admin.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce((select role = 'super_admin' from public.users where id = auth.uid()), false);
$$;

-- ----- USERS -----
-- Everyone authenticated can read user records (used to populate the team view).
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select using (auth.uid() is not null);

-- Only the user themself or super_admins can update.
drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update using (auth.uid() = id or public.is_admin());

-- Only super_admins can insert/delete (acts as the User Management panel).
drop policy if exists users_insert on public.users;
create policy users_insert on public.users
  for insert with check (public.is_admin());
drop policy if exists users_delete on public.users;
create policy users_delete on public.users
  for delete using (public.is_admin());

-- ----- ENTITIES / BANKS / CONTACTS -----
-- Read: any authenticated user. Write: super_admins only.
drop policy if exists entities_select on public.entities;
create policy entities_select on public.entities for select using (auth.uid() is not null);
drop policy if exists entities_write on public.entities;
create policy entities_write on public.entities for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists banks_select on public.bank_profiles;
create policy banks_select on public.bank_profiles for select using (auth.uid() is not null);
drop policy if exists banks_write on public.bank_profiles;
create policy banks_write on public.bank_profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select using (auth.uid() is not null);
drop policy if exists contacts_write on public.contacts;
create policy contacts_write on public.contacts for all using (public.is_admin()) with check (public.is_admin());

-- ----- CLIENTS -----
-- Internal team can READ, super_admins can write. Partners do NOT see clients.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using (public.current_role() in ('super_admin','internal'));
drop policy if exists clients_write on public.clients;
create policy clients_write on public.clients
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- TRADES -----
-- Read: any authenticated user (partner sees all trades for portfolio).
-- Write: super_admin only (internal team uploads docs but doesn't mutate trade rows directly).
drop policy if exists trades_select on public.trades;
create policy trades_select on public.trades for select using (auth.uid() is not null);
drop policy if exists trades_write on public.trades;
create policy trades_write on public.trades for all using (public.is_admin()) with check (public.is_admin());

-- ----- DOCUMENTS -----
-- Read: anyone authenticated. Insert: super_admin OR internal team.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select using (auth.uid() is not null);
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert with check (public.current_role() in ('super_admin','internal'));
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update using (public.is_admin());
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete using (public.is_admin());

-- ----- ACTIVITY -----
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select using (auth.uid() is not null);
drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert with check (auth.uid() is not null);

-- =============================================================
-- Storage bucket (run after creating the trade-documents bucket
-- in the Supabase Storage UI, OR uncomment the line below to
-- have the migration create it for you).
-- =============================================================
-- insert into storage.buckets (id, name, public) values ('trade-documents','trade-documents',false) on conflict do nothing;

-- Allow authenticated users to read documents in the bucket; only
-- super_admins / internal team can write.
drop policy if exists docs_storage_select on storage.objects;
create policy docs_storage_select on storage.objects
  for select using (bucket_id = 'trade-documents' and auth.uid() is not null);
drop policy if exists docs_storage_insert on storage.objects;
create policy docs_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'trade-documents'
    and public.current_role() in ('super_admin','internal')
  );
drop policy if exists docs_storage_update on storage.objects;
create policy docs_storage_update on storage.objects
  for update using (bucket_id = 'trade-documents' and public.is_admin());
drop policy if exists docs_storage_delete on storage.objects;
create policy docs_storage_delete on storage.objects
  for delete using (bucket_id = 'trade-documents' and public.is_admin());

-- =============================================================
-- Auto-provision a public.users row when a new auth.users is created
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, full_name, role, is_active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'internal'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
