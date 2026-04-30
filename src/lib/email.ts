// ============================================================
// Frontend wrapper around the `send-contract` Edge Function.
// In Supabase mode it actually sends the email via Resend.
// In demo mode it falls back to logging activity locally so the
// UI stays usable for screencasts.
// ============================================================

import { getSupabase, isSupabaseEnabled } from './supabase/client';
import { activityDB, nowIso, tradesDB, uid } from './storage/db';

export interface SendContractRequest {
  tradeId: string;
  to: string[];
  cc?: string[];
  subject: string;
  message: string;
  attachmentDocumentIds: string[];
  schedule_at?: string;
}

export interface SendContractResult {
  ok: boolean;
  resend_id?: string;
  scheduled?: boolean;
  /** True when the email was simulated (demo mode). */
  simulated?: boolean;
  error?: string;
}

export async function sendContract(
  req: SendContractRequest,
  actorId?: string,
): Promise<SendContractResult> {
  if (!isSupabaseEnabled()) {
    // Demo mode: simulate latency and log activity so the timeline
    // still updates.
    await new Promise((r) => setTimeout(r, 500));
    activityDB.insert({
      id: uid('act'),
      trade_id: req.tradeId,
      type: 'contract_sent',
      message: `[DEMO] Contract email simulated to ${req.to.join(', ')}${
        req.cc?.length ? ` (cc ${req.cc.join(', ')})` : ''
      }`,
      meta: {
        to: req.to,
        cc: req.cc ?? [],
        subject: req.subject,
        simulated: true,
      },
      actor_id: actorId,
      created_at: nowIso(),
    });
    const trade = tradesDB.byId(req.tradeId);
    if (trade?.trade_status === 'draft') {
      tradesDB.update(req.tradeId, { trade_status: 'active' });
    }
    return { ok: true, simulated: true };
  }

  const sb = getSupabase();
  const { data, error } = await sb.functions.invoke('send-contract', {
    body: req,
  });
  if (error) {
    return { ok: false, error: error.message ?? 'Failed to send contract' };
  }
  if (data?.error) {
    return { ok: false, error: data.error };
  }
  return {
    ok: true,
    resend_id: data?.resend_id,
    scheduled: data?.scheduled,
  };
}
