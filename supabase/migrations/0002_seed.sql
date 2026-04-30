-- =============================================================
-- TradeMirror OS — initial seed data
-- Run AFTER 0001_init.sql. Idempotent: safe to re-run.
-- =============================================================

-- Default entity (Chipa Farm LLC)
insert into public.entities (id, name, country, ruc_ein, address, city, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'CHIPA FARM LLC', 'USA', '99-1234567', '30 N Gould St Ste R', 'Sheridan, WY 82801', true),
  ('00000000-0000-0000-0000-000000000002', 'CHIPA TECH E.A.S.', 'PARAGUAY', '80123456-7', 'CALLE DR. EUSEBIO LILIO Y BERNARDINO CABALLERO #2880', 'ASUNCION', true)
on conflict (id) do nothing;

-- Default banking profile per entity
insert into public.bank_profiles (
  id, entity_id, profile_name,
  beneficiary_name, beneficiary_address,
  intermediary_bank_name, intermediary_bank_swift, intermediary_account_number, intermediary_location,
  bank_name, bank_swift, account_number, ara_number,
  field_71a, is_default
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'LLC — Mercury Business',
    'CHIPA FARM LLC', '30 N Gould St Ste R, Sheridan, WY 82801, USA',
    'JPMORGAN CHASE BANK NA', 'CHASUS33', '021000021', 'NEW YORK, USA',
    'CHOICE FINANCIAL GROUP', 'CHFGUS44', '202412345678', null,
    'OUR', true
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'EAS — Banco Nacional de Fomento',
    'CHIPA TECH E.A.S.', 'CALLE DR. EUSEBIO LILIO Y BERNARDINO CABALLERO #2880',
    'CITIBANK NA', 'CITIUS33', '36097335', 'NEW YORK, USA',
    'BANCO NACIONAL DE FOMENTO', 'BNFAPYPAXXX', '000000022300', null,
    'OUR', true
  )
on conflict (id) do nothing;

-- Default contact (whose details appear on generated contracts)
insert into public.contacts (id, full_name, phone, email, role, is_default) values
  ('20000000-0000-0000-0000-000000000001', 'Ali Kanso', '+20 1017299515', 'ali@chipafarm.com', 'Trade Operations', true)
on conflict (id) do nothing;

-- Sample client
insert into public.clients (id, company_name, address, city, country, tax_id, contact_name, contact_email, contact_phone, notes) values
  (
    '30000000-0000-0000-0000-000000000001',
    'NILE PROTEIN IMPORTS S.A.E.',
    '14 El Tahrir St, Dokki', 'Cairo', 'Egypt',
    '300-555-9912', 'Mahmoud El-Sayed', 'mahmoud@nileprotein.eg', '+20 100 555 7711',
    'Halal-certified imports only. CFR Alexandria standard.'
  )
on conflict (id) do nothing;
