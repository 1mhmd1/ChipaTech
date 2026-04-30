// Branded HTML email shell. Inline-styled because some email
// clients (Outlook especially) ignore <style> blocks. Keep it
// table-based for max compat.

interface ContractEmailParams {
  recipientName?: string;
  message: string;
  tradeReference: string;
  entityName: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export function renderContractEmail(p: ContractEmailParams): string {
  const safe = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sales Contract — ${p.tradeReference}</title>
</head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2230;-webkit-font-smoothing:antialiased;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f8fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(15,19,32,0.06);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <div style="display:inline-block;width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#0f1320 0%,#2f3445 100%);color:#fff;text-align:center;line-height:36px;font-weight:800;font-size:16px;letter-spacing:-0.02em;">T</div>
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;">
                    <div style="font-size:14px;font-weight:600;color:#1d2230;line-height:1.2;">${p.entityName}</div>
                    <div style="font-size:11px;color:#8a93a8;text-transform:uppercase;letter-spacing:0.08em;line-height:1.3;margin-top:2px;">Sales Contract</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <div style="font-size:11px;color:#8a93a8;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Reference</div>
              <div style="font-size:24px;font-weight:700;color:#0f1320;letter-spacing:-0.02em;margin-top:4px;">${p.tradeReference}</div>
            </td>
          </tr>

          <!-- Message -->
          <tr>
            <td style="padding:16px 32px 24px;font-size:15px;line-height:1.6;color:#434a5c;">
              ${safe(p.message)}
            </td>
          </tr>

          <!-- Attachment chip -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f7f8fa;border:1px solid #eef0f4;border-radius:10px;">
                <tr>
                  <td style="padding:12px 14px;vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;">
                          <div style="width:32px;height:32px;background:#1d2230;border-radius:6px;color:#fff;text-align:center;line-height:32px;font-size:9px;font-weight:700;letter-spacing:0.04em;">PDF</div>
                        </td>
                        <td style="padding-left:10px;vertical-align:middle;">
                          <div style="font-size:13px;font-weight:600;color:#1d2230;">${p.tradeReference}-sales-contract.pdf</div>
                          <div style="font-size:11px;color:#8a93a8;margin-top:1px;">Attached to this email</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Contact -->
          ${
            p.contactName || p.contactEmail
              ? `<tr>
            <td style="padding:0 32px 24px;">
              <div style="border-top:1px solid #eef0f4;padding-top:20px;">
                <div style="font-size:11px;color:#8a93a8;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:6px;">Questions?</div>
                <div style="font-size:13px;color:#434a5c;line-height:1.5;">
                  ${p.contactName ? `<strong style="color:#1d2230;">${safe(p.contactName)}</strong><br>` : ''}
                  ${p.contactEmail ? `<a href="mailto:${p.contactEmail}" style="color:#1672ed;text-decoration:none;">${p.contactEmail}</a>` : ''}
                  ${p.contactPhone ? ` &nbsp;·&nbsp; ${safe(p.contactPhone)}` : ''}
                </div>
              </div>
            </td>
          </tr>`
              : ''
          }

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;background:#f7f8fa;border-top:1px solid #eef0f4;">
              <div style="font-size:11px;color:#8a93a8;line-height:1.5;">
                Sent by <strong style="color:#434a5c;">${p.entityName}</strong> via TradeMirror OS.
                <br>This message contains a binding sales contract — please review and reply with your signed copy.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

interface OverdueEmailParams {
  adminName?: string;
  tradeReference: string;
  clientName: string;
  milestone: 'advance' | 'balance';
  amountDue: string;
  daysOverdue: number;
  tradeUrl: string;
}

export function renderOverdueEmail(p: OverdueEmailParams): string {
  const milestoneLabel = p.milestone === 'advance' ? '50% Advance' : '50% Balance';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f7f8fa;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2230;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #fee2e2;box-shadow:0 1px 3px rgba(220,38,38,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#fef2f2 0%,#fff 100%);padding:24px 32px 16px;border-bottom:1px solid #fee2e2;">
              <div style="display:inline-block;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:4px 8px;border-radius:999px;border:1px solid #fee2e2;">⚠ Milestone Overdue</div>
              <div style="font-size:22px;font-weight:700;color:#0f1320;letter-spacing:-0.02em;margin-top:14px;">${milestoneLabel} not received</div>
              <div style="font-size:14px;color:#5e6577;margin-top:6px;">${p.clientName} · ${p.daysOverdue} day${p.daysOverdue === 1 ? '' : 's'} past T+7</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:11px;color:#8a93a8;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;padding-bottom:4px;">Trade</td>
                  <td style="font-size:11px;color:#8a93a8;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;padding-bottom:4px;text-align:right;">Amount due</td>
                </tr>
                <tr>
                  <td style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:14px;font-weight:600;color:#0f1320;">${p.tradeReference}</td>
                  <td style="font-size:18px;font-weight:700;color:#0f1320;text-align:right;font-variant-numeric:tabular-nums;">${p.amountDue}</td>
                </tr>
              </table>
              <div style="margin-top:24px;text-align:center;">
                <a href="${p.tradeUrl}" style="display:inline-block;background:#0f1320;color:#fff;font-size:13px;font-weight:600;padding:10px 18px;border-radius:8px;text-decoration:none;">Open trade folder →</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;background:#f7f8fa;border-top:1px solid #eef0f4;font-size:11px;color:#8a93a8;line-height:1.5;">
              Automated alert from TradeMirror OS.
              You are receiving this because you are a Super Admin on Chipa Farm LLC.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
