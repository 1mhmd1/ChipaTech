/* eslint-disable @typescript-eslint/ban-ts-comment */
// =============================================================
// Edge Function: send-contract
//
// Sends a mirrored sales contract to the client via Resend.
// Called from the browser SendContractModal in Supabase mode.
// Auth: bearer JWT from the signed-in user — must be super_admin.
//
// Required env (set via Supabase dashboard → Edge Functions → Secrets):
//   RESEND_API_KEY     — your Resend API key
//   RESEND_FROM        — verified sender, e.g. "TradeMirror <noreply@chipafarm.com>"
//
// Auto-injected by Supabase:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// =============================================================

// @ts-nocheck — Deno runtime, not Node
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { renderContractEmail } from '../_shared/email-template.ts';

interface SendContractBody {
  tradeId: string;
  to: string[];           // primary recipient(s)
  cc?: string[];
  subject: string;
  message: string;
  attachmentDocumentIds: string[]; // documents.id rows to attach
  schedule_at?: string;            // ISO date for scheduled send (Resend supports this)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function bytesToBase64(bytes: Uint8Array): Promise<string> {
  // chunk to avoid stack overflow on large PDFs
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)),
    );
  }
  return btoa(binary);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing auth' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify the caller's JWT and pull their public.users row
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Service-role client for everything else (bypasses RLS so we
    // can read documents from Storage and write activity log).
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await sb
      .from('users')
      .select('role,email,full_name')
      .eq('id', user.id)
      .single();
    if (profile?.role !== 'super_admin') {
      return jsonResponse({ error: 'Forbidden — super_admin only' }, 403);
    }

    const body = (await req.json()) as SendContractBody;
    if (!body.tradeId || !body.to?.length || !body.subject) {
      return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    // Pull trade + entity + contact for the email template
    const { data: trade, error: tradeErr } = await sb
      .from('trades')
      .select('*, entity:entities(name), contact:contacts(full_name,email,phone), client:clients(company_name,contact_name)')
      .eq('id', body.tradeId)
      .single();
    if (tradeErr || !trade) {
      return jsonResponse({ error: 'Trade not found' }, 404);
    }

    // Pull each requested document and turn it into a Resend attachment
    const { data: docs, error: docsErr } = await sb
      .from('documents')
      .select('*')
      .in('id', body.attachmentDocumentIds);
    if (docsErr) return jsonResponse({ error: docsErr.message }, 500);

    const attachments = await Promise.all(
      (docs ?? []).map(async (d) => {
        const { data: blob, error } = await sb.storage
          .from('trade-documents')
          .download(d.storage_path);
        if (error || !blob) {
          throw new Error(
            `Failed to download ${d.file_name}: ${error?.message}`,
          );
        }
        const buf = new Uint8Array(await blob.arrayBuffer());
        return {
          filename: d.file_name,
          content: await bytesToBase64(buf),
        };
      }),
    );

    // Send via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail =
      Deno.env.get('RESEND_FROM') ?? 'TradeMirror <noreply@chipafarm.com>';
    if (!resendKey) {
      return jsonResponse(
        { error: 'RESEND_API_KEY not configured on the function' },
        500,
      );
    }

    const html = renderContractEmail({
      message: body.message,
      tradeReference: trade.trade_reference,
      entityName: trade.entity?.name ?? 'Chipa Farm LLC',
      contactName: trade.contact?.full_name,
      contactEmail: trade.contact?.email,
      contactPhone: trade.contact?.phone,
      recipientName: trade.client?.contact_name,
    });

    const payload: Record<string, unknown> = {
      from: fromEmail,
      to: body.to,
      cc: body.cc,
      reply_to: trade.contact?.email,
      subject: body.subject,
      html,
      attachments,
    };
    if (body.schedule_at) payload.scheduled_at = body.schedule_at;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const respBody = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return jsonResponse(
        {
          error: 'Resend rejected the request',
          status: resp.status,
          detail: respBody,
        },
        502,
      );
    }

    // Log activity + flip trade status to active if it was draft
    await sb.from('activity').insert({
      trade_id: body.tradeId,
      type: 'contract_sent',
      message: `Contract emailed to ${body.to.join(', ')}${
        body.cc?.length ? ` (cc ${body.cc.join(', ')})` : ''
      }`,
      meta: {
        to: body.to,
        cc: body.cc ?? [],
        resend_id: respBody.id,
        scheduled_at: body.schedule_at ?? null,
        sent_by: profile.email,
      },
      actor_id: user.id,
    });

    if (trade.trade_status === 'draft') {
      await sb
        .from('trades')
        .update({
          trade_status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.tradeId);
    }

    return jsonResponse({
      ok: true,
      resend_id: respBody.id,
      scheduled: Boolean(body.schedule_at),
    });
  } catch (err) {
    return jsonResponse(
      { error: (err as Error).message ?? 'Internal error' },
      500,
    );
  }
});
