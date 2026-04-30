// =============================================================
// Edge Function: check-milestones
//
// Runs daily via pg_cron (see cron.sql in this repo). For each
// trade whose advance or balance milestone is past T+7 and still
// pending, it:
//   1. Flips the milestone to "overdue"
//   2. Emails every active super_admin via Resend
//   3. Logs an `activity` row so the timeline shows the alert
//
// Idempotent: running twice the same day re-sends nothing because
// step 1 only runs for `pending` rows; once flipped to `overdue`
// they're skipped.
// =============================================================

// @ts-nocheck — Deno runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { renderOverdueEmail } from '../_shared/email-template.ts';

interface Trade {
  id: string;
  trade_reference: string;
  signing_date: string | null;
  bol_date: string | null;
  advance_status: 'pending' | 'received' | 'overdue';
  balance_status: 'pending' | 'received' | 'overdue';
  sale_total: number;
  client_id: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n || 0);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail =
      Deno.env.get('RESEND_FROM') ?? 'TradeMirror <noreply@chipafarm.com>';
    const appUrl =
      Deno.env.get('APP_URL') ?? 'https://trademirror.chipafarm.com';
    if (!resendKey) {
      return new Response('RESEND_API_KEY not configured', { status: 500 });
    }

    // Pull every active super_admin email
    const { data: admins } = await sb
      .from('users')
      .select('email,full_name')
      .eq('role', 'super_admin')
      .eq('is_active', true);
    const adminEmails = (admins ?? []).map((a) => a.email);
    if (adminEmails.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, alerts: 0, note: 'No active super_admins' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Pull every trade with at least one milestone still pending
    const { data: trades } = await sb
      .from('trades')
      .select(
        'id,trade_reference,signing_date,bol_date,advance_status,balance_status,sale_total,client_id',
      )
      .or('advance_status.eq.pending,balance_status.eq.pending');

    let alertsSent = 0;
    const sevenDaysAgo = Date.now() - 7 * DAY_MS;

    for (const t of (trades ?? []) as Trade[]) {
      const overdueMilestones: Array<'advance' | 'balance'> = [];

      // Advance: signing_date + 7
      if (
        t.advance_status === 'pending' &&
        t.signing_date &&
        new Date(t.signing_date).getTime() < sevenDaysAgo
      ) {
        overdueMilestones.push('advance');
      }
      // Balance: bol_date + 7
      if (
        t.balance_status === 'pending' &&
        t.bol_date &&
        new Date(t.bol_date).getTime() < sevenDaysAgo
      ) {
        overdueMilestones.push('balance');
      }
      if (overdueMilestones.length === 0) continue;

      // Look up client name (one extra round trip; fine for daily job)
      const { data: client } = await sb
        .from('clients')
        .select('company_name')
        .eq('id', t.client_id)
        .single();

      for (const milestone of overdueMilestones) {
        const triggerDate = milestone === 'advance' ? t.signing_date! : t.bol_date!;
        const daysOverdue = daysSince(triggerDate) - 7;
        const amount = t.sale_total / 2;

        // Send email
        const html = renderOverdueEmail({
          tradeReference: t.trade_reference,
          clientName: client?.company_name ?? 'Unknown client',
          milestone,
          amountDue: fmtUSD(amount),
          daysOverdue,
          tradeUrl: `${appUrl}/trades/${t.id}`,
        });

        const subject = `TradeMirror Alert: ${client?.company_name ?? t.trade_reference} — ${milestone === 'advance' ? 'Advance' : 'Balance'} Overdue`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: adminEmails,
            subject,
            html,
          }),
        });

        // Flip the milestone to overdue
        const update: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (milestone === 'advance') update.advance_status = 'overdue';
        else update.balance_status = 'overdue';
        update.trade_status = 'overdue';
        await sb.from('trades').update(update).eq('id', t.id);

        // Log
        await sb.from('activity').insert({
          trade_id: t.id,
          type: 'milestone_overdue',
          message: `${milestone === 'advance' ? '50% advance' : '50% balance'} overdue by ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} — alert emailed to ${adminEmails.length} super-admin${adminEmails.length === 1 ? '' : 's'}`,
          meta: {
            milestone,
            days_overdue: daysOverdue,
            amount_due: amount,
            recipients: adminEmails,
          },
        });

        alertsSent++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, alerts: alertsSent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
