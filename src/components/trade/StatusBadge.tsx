import type { MilestoneStatus, TradeStatus } from '../../types';
import { Badge } from '../ui/Badge';

const STATUS_LABELS: Record<TradeStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  advance_received: 'Advance Received',
  shipped: 'Shipped',
  balance_received: 'Completed',
  overdue: 'Overdue',
};

const STATUS_TONES: Record<TradeStatus, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  active: 'brand',
  advance_received: 'brand',
  shipped: 'warning',
  balance_received: 'success',
  overdue: 'danger',
};

export function TradeStatusBadge({ status }: { status: TradeStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot pulse={status === 'overdue'}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

const MILESTONE_LABELS: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  received: 'Received',
  overdue: 'Overdue',
};

const MILESTONE_TONES: Record<MilestoneStatus, 'neutral' | 'success' | 'danger'> = {
  pending: 'neutral',
  received: 'success',
  overdue: 'danger',
};

export function MilestoneBadge({ status }: { status: MilestoneStatus }) {
  return (
    <Badge tone={MILESTONE_TONES[status]} dot pulse={status === 'overdue'}>
      {MILESTONE_LABELS[status]}
    </Badge>
  );
}
