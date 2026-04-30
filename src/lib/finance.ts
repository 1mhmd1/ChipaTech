// Per-trade financial calculations. Single source of truth so
// the editor preview and the persisted record stay in lockstep.

import type { Trade } from '../../src/types';

export interface FinancialInputs {
  quantity_tons: number;
  frigo_total: number;
  sale_unit_price: number;
  shipping_cost: number;
  insurance_cost: number;
  bank_fees: number;
}

export interface FinancialResult {
  sale_total: number;
  total_costs: number;
  net_profit: number;
  margin_pct: number;
  advance_amount: number;
  balance_amount: number;
}

export function computeFinancials(i: FinancialInputs): FinancialResult {
  const sale_total = round2(i.quantity_tons * i.sale_unit_price);
  const total_costs = round2(
    i.frigo_total + i.shipping_cost + i.insurance_cost + i.bank_fees,
  );
  const net_profit = round2(sale_total - total_costs);
  const margin_pct = sale_total > 0 ? (net_profit / sale_total) * 100 : 0;
  const advance_amount = round2(sale_total * 0.5);
  const balance_amount = round2(sale_total - advance_amount);
  return {
    sale_total,
    total_costs,
    net_profit,
    margin_pct,
    advance_amount,
    balance_amount,
  };
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function tradeFinancialsFor(t: Trade): FinancialResult {
  return computeFinancials({
    quantity_tons: t.quantity_tons,
    frigo_total: t.frigo_total,
    sale_unit_price: t.sale_unit_price,
    shipping_cost: t.shipping_cost,
    insurance_cost: t.insurance_cost,
    bank_fees: t.bank_fees,
  });
}
