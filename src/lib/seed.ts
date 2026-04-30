// Seed sensible defaults so the app is usable on first run.
// Idempotent: only seeds tables that are empty.

import {
  banksDB,
  clientsDB,
  contactsDB,
  entitiesDB,
  usersDB,
} from './storage/db';
import type { BankProfile, Client, Contact, Entity, User } from '../types';

export function seedIfEmpty() {
  if (usersDB.list().length === 0) seedUsers();
  if (entitiesDB.list().length === 0) seedEntitiesAndBanks();
  if (contactsDB.list().length === 0) seedContacts();
  if (clientsDB.list().length === 0) seedClients();
}

function nowIso() {
  return new Date().toISOString();
}

function seedUsers() {
  const owner: User = {
    id: 'user_owner',
    email: 'rabih@chipafarm.com',
    full_name: 'Rabih (Owner)',
    role: 'super_admin',
    is_active: true,
    created_at: nowIso(),
  };
  const team: User = {
    id: 'user_team',
    email: 'team@chipafarm.com',
    full_name: 'Internal Team',
    role: 'internal',
    is_active: true,
    created_at: nowIso(),
  };
  const partner: User = {
    id: 'user_partner',
    email: 'partner@chipafarm.com',
    full_name: 'Financier Partner',
    role: 'partner',
    is_active: true,
    created_at: nowIso(),
  };
  usersDB.insert(owner);
  usersDB.insert(team);
  usersDB.insert(partner);
}

function seedEntitiesAndBanks() {
  const eas: Entity = {
    id: 'ent_eas',
    name: 'CHIPA TECH E.A.S.',
    country: 'PARAGUAY',
    ruc_ein: '80123456-7',
    address:
      'CALLE DR. EUSEBIO LILIO Y BERNARDINO CABALLERO #2880',
    city: 'ASUNCION',
    is_active: true,
    created_at: nowIso(),
  };
  const llc: Entity = {
    id: 'ent_llc',
    name: 'CHIPA FARM LLC',
    country: 'USA',
    ruc_ein: '99-1234567',
    address: '30 N Gould St Ste R',
    city: 'Sheridan, WY 82801',
    is_active: true,
    created_at: nowIso(),
  };
  entitiesDB.insert(eas);
  entitiesDB.insert(llc);

  const easBank: BankProfile = {
    id: 'bank_eas',
    entity_id: eas.id,
    profile_name: 'EAS — Banco Nacional de Fomento',
    beneficiary_name: 'CHIPA TECH E.A.S.',
    beneficiary_address: 'CALLE DR. EUSEBIO LILIO Y BERNARDINO CABALLERO #2880',
    intermediary_bank_name: 'CITIBANK NA',
    intermediary_bank_swift: 'CITIUS33',
    intermediary_account_number: '36097335',
    intermediary_location: 'NEW YORK, USA',
    bank_name: 'BANCO NACIONAL DE FOMENTO',
    bank_swift: 'BNFAPYPAXXX',
    account_number: '000000022300',
    field_71a: 'OUR',
    is_default: true,
    created_at: nowIso(),
  };
  const llcBank: BankProfile = {
    id: 'bank_llc',
    entity_id: llc.id,
    profile_name: 'LLC — Mercury Business',
    beneficiary_name: 'CHIPA FARM LLC',
    beneficiary_address: '30 N Gould St Ste R, Sheridan, WY 82801, USA',
    intermediary_bank_name: 'JPMORGAN CHASE BANK NA',
    intermediary_bank_swift: 'CHASUS33',
    intermediary_account_number: '021000021',
    intermediary_location: 'NEW YORK, USA',
    bank_name: 'CHOICE FINANCIAL GROUP',
    bank_swift: 'CHFGUS44',
    account_number: '202412345678',
    field_71a: 'OUR',
    is_default: true,
    created_at: nowIso(),
  };
  banksDB.insert(easBank);
  banksDB.insert(llcBank);
}

function seedContacts() {
  const c1: Contact = {
    id: 'ct_ali',
    full_name: 'Ali Kanso',
    phone: '+20 1017299515',
    email: 'ali@chipafarm.com',
    role: 'Trade Operations',
    is_default: true,
    created_at: nowIso(),
  };
  const c2: Contact = {
    id: 'ct_rabih',
    full_name: 'Rabih',
    phone: '+1 305 555 0102',
    email: 'rabih@chipafarm.com',
    role: 'Owner',
    is_default: false,
    created_at: nowIso(),
  };
  contactsDB.insert(c1);
  contactsDB.insert(c2);
}

function seedClients() {
  const buyers: Client[] = [
    {
      id: 'cli_egypt',
      company_name: 'NILE PROTEIN IMPORTS S.A.E.',
      address: '14 El Tahrir St, Dokki',
      city: 'Cairo',
      country: 'Egypt',
      tax_id: '300-555-9912',
      contact_name: 'Mahmoud El-Sayed',
      contact_email: 'mahmoud@nileprotein.eg',
      contact_phone: '+20 100 555 7711',
      notes: 'Halal-certified imports only. CFR Alexandria standard.',
      created_at: nowIso(),
    },
    {
      id: 'cli_jordan',
      company_name: 'AMMAN MEAT TRADING CO.',
      address: 'King Abdullah II St, Bldg 42',
      city: 'Amman',
      country: 'Jordan',
      tax_id: '0067-441',
      contact_name: 'Layla Al-Khateeb',
      contact_email: 'layla@ammanmeat.jo',
      contact_phone: '+962 79 555 4488',
      created_at: nowIso(),
    },
  ];
  for (const c of buyers) clientsDB.insert(c);
}
