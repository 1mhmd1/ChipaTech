// ============================================================
// Domain Types — TradeMirror OS
// Mirrors the schema in §14 of the PRD. Persistence layer is
// pluggable; today it's localStorage, tomorrow Supabase.
// ============================================================

export type UserRole = 'super_admin' | 'internal' | 'partner';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  invited_at?: string;
  last_login_at?: string;
  created_at: string;
}

export interface Entity {
  id: string;
  name: string;
  country: string;
  ruc_ein: string;
  address: string;
  city: string;
  is_active: boolean;
  created_at: string;
}

export interface BankProfile {
  id: string;
  entity_id: string;
  profile_name: string;
  beneficiary_name: string;
  beneficiary_address: string;
  intermediary_bank_name: string;
  intermediary_bank_swift: string;
  intermediary_account_number?: string;
  intermediary_location?: string;
  bank_name: string;
  bank_swift: string;
  account_number: string;
  ara_number?: string;
  field_71a: string;
  is_default: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  address: string;
  city: string;
  country: string;
  tax_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  notes?: string;
  created_at: string;
}

export interface Contact {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  role?: string;
  is_default: boolean;
  created_at: string;
}

export type TradeStatus =
  | 'draft'
  | 'active'
  | 'advance_received'
  | 'shipped'
  | 'balance_received'
  | 'overdue';

export type MilestoneStatus = 'pending' | 'received' | 'overdue';

export interface Trade {
  id: string;
  trade_reference: string;

  entity_id: string;
  bank_profile_id: string;
  client_id: string;
  contact_id: string;

  contract_date: string;
  signing_date?: string;
  bol_date?: string;

  frigo_contract_ref: string;
  quantity_tons: number;
  product_description: string;

  // Financial
  frigo_unit_price: number;
  frigo_total: number;
  sale_unit_price: number;
  sale_total: number;
  shipping_cost: number;
  insurance_cost: number;
  bank_fees: number;
  total_costs: number;
  net_profit: number;

  // Source PDF specs (read-only mirror)
  brand?: string;
  validity?: string;
  temperature?: string;
  packing?: string;
  shipment_date?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  plant_no?: string;
  freight_condition?: string;
  observations?: string;
  prepayment_condition?: string;
  balance_condition?: string;

  // Milestones
  advance_status: MilestoneStatus;
  advance_received_at?: string;
  advance_due_date?: string;
  balance_status: MilestoneStatus;
  balance_received_at?: string;
  balance_due_date?: string;

  trade_status: TradeStatus;

  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | 'frigo_contract'
  | 'sales_contract'
  | 'signed_contract'
  | 'bol'
  | 'other';

export interface TradeDocument {
  id: string;
  trade_id: string;
  document_type: DocumentType;
  file_name: string;
  // base64 data URL — fine for the prototype, swap for Supabase Storage path later
  storage_path: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface ActivityEvent {
  id: string;
  trade_id: string;
  type:
    | 'trade_created'
    | 'contract_generated'
    | 'contract_sent'
    | 'document_uploaded'
    | 'status_changed'
    | 'milestone_received'
    | 'milestone_overdue'
    | 'note';
  message: string;
  meta?: Record<string, unknown>;
  actor_id?: string;
  created_at: string;
}

// ============================================================
// Parsed contract — output of pdf-parse on the supplier PDF
// ============================================================

export interface ParsedContract {
  contractRef: string;
  exporterName: string;
  exporterRUC: string;
  exporterAddress: string;
  exporterCity: string;
  exporterCountry: string;

  salesPerson?: string;
  salesAssistant?: string;
  dateOfIssue?: string;
  exporterEmail?: string;

  clientName?: string;
  clientAddress?: string;
  clientCity?: string;
  clientCountry?: string;

  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;

  payerName?: string;
  payerCountry?: string;
  payerCompanyCountry?: string;

  quantity: number;
  productDescription: string;
  unitPrice: number;
  totalAmount: number;

  brand?: string;
  validity?: string;
  temperature?: string;
  packing?: string;
  shipmentDate?: string;
  origin?: string;
  destination?: string;
  incoterm?: string;
  plantNo?: string;
  freightCondition?: string;
  freightCost?: number;
  insuranceCost?: number;
  prepaymentCondition?: string;
  balanceCondition?: string;
  observations?: string;
  lawAndJurisdiction?: string;
  requiresInspection?: string;

  beneficiaryName?: string;
  beneficiaryAddress?: string;
  intermediaryBank?: string;
  intermediarySwift?: string;
  intermediaryAccountNumber?: string;
  intermediaryLocation?: string;
  bankParaguay?: string;
  bankSwift?: string;
  accountNumber?: string;
  araNumber?: string;
}
