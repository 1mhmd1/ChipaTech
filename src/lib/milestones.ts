// Milestone evaluator — runs on app load and after any trade
// mutation to flip pending → overdue based on T+7 deadlines.

import type { MilestoneStatus, Trade, TradeStatus } from '../types';
import { logActivity, tradesDB } from './storage/db';
import { addDaysISO } from './format';

export interface MilestoneAlert {
  trade: Trade;
  type: 'advance' | 'balance';
  daysOverdue: number;
}

function isOverdue(dueIso: string | undefined, status: MilestoneStatus): boolean {
  if (!dueIso) return false;
  if (status === 'received') return false;
  return new Date(dueIso).getTime() < Date.now();
}

export function evaluateMilestones(): MilestoneAlert[] {
  const alerts: MilestoneAlert[] = [];
  const trades = tradesDB.list();
  const now = Date.now();

  for (const trade of trades) {
    const updates: Partial<Trade> = {};

    // Advance deadline = signing_date (or contract_date) + 7
    const advanceTrigger = trade.signing_date ?? trade.contract_date;
    const advanceDue = advanceTrigger
      ? addDaysISO(advanceTrigger, 7)
      : undefined;

    if (advanceDue && trade.advance_status !== 'received') {
      const overdue = isOverdue(advanceDue, trade.advance_status);
      if (overdue && trade.advance_status !== 'overdue') {
        updates.advance_status = 'overdue';
        logActivity(
          trade.id,
          'milestone_overdue',
          `Advance milestone overdue (was due ${new Date(advanceDue).toLocaleDateString()})`,
        );
      }
      if (overdue) {
        alerts.push({
          trade,
          type: 'advance',
          daysOverdue: Math.floor(
            (now - new Date(advanceDue).getTime()) / (1000 * 60 * 60 * 24),
          ),
        });
      }
    }
    if (advanceDue && updates.advance_due_date !== advanceDue) {
      updates.advance_due_date = advanceDue;
    }

    // Balance deadline = bol_date + 7
    if (trade.bol_date) {
      const balanceDue = addDaysISO(trade.bol_date, 7);
      if (trade.balance_status !== 'received') {
        const overdue = isOverdue(balanceDue, trade.balance_status);
        if (overdue && trade.balance_status !== 'overdue') {
          updates.balance_status = 'overdue';
          logActivity(
            trade.id,
            'milestone_overdue',
            `Balance milestone overdue (was due ${new Date(balanceDue).toLocaleDateString()})`,
          );
        }
        if (overdue) {
          alerts.push({
            trade,
            type: 'balance',
            daysOverdue: Math.floor(
              (now - new Date(balanceDue).getTime()) / (1000 * 60 * 60 * 24),
            ),
          });
        }
      }
      if (updates.balance_due_date !== balanceDue) {
        updates.balance_due_date = balanceDue;
      }
    }

    // Compute roll-up trade status
    const newStatus = computeStatus({ ...trade, ...updates });
    if (newStatus !== trade.trade_status) {
      updates.trade_status = newStatus;
      logActivity(
        trade.id,
        'status_changed',
        `Status changed to ${newStatus}`,
      );
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      tradesDB.update(trade.id, updates);
    }
  }
  return alerts;
}

export function computeStatus(t: Partial<Trade>): TradeStatus {
  if (t.balance_status === 'received') return 'balance_received';
  if (t.advance_status === 'overdue' || t.balance_status === 'overdue') {
    return 'overdue';
  }
  if (t.bol_date) return 'shipped';
  if (t.advance_status === 'received') return 'advance_received';
  if (t.signing_date) return 'active';
  return t.trade_status === 'draft' ? 'draft' : t.trade_status ?? 'draft';
}
