// ============================================================
// PDF Mirror Generator (v2 — auto-coordinates)
// Loads the supplier PDF, extracts every text run with its
// exact rectangle, and uses those rectangles to drive the
// white-block overlay. No guessed pixel coordinates.
//
// Every paint(field, value) call:
//   1. Looks up the rect via the extracted layout
//   2. Draws an opaque white rectangle over it (with padding)
//   3. Injects the new value at the original baseline + size
//
// Pure-mirror fields are never looked up and never overlaid.
// ============================================================

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import {
  bbox,
  continuationLines,
  expandRectRight,
  extractLayout,
  findLabel,
  findLabelBelow,
  locateByText,
  locateLabelValue,
  locateProductsRow,
  locateTotalsRow,
  rectFromItem,
  valueItemsAfter,
  type PageLayout,
  type Rect,
  type TextRun,
} from './extract';
import { formatMoney, formatUnitPrice } from '../format';

export interface MirrorPayload {
  exporter: {
    name: string;
    ruc: string;
    address: string;
    city: string;
    country: string;
  };
  client: {
    name: string;
    address: string;
    city: string;
    country: string;
  };
  contact: {
    name: string;
    phone: string;
    email: string;
  };
  payer: {
    name: string;
    country: string;
    companyCountry: string;
  };
  product: {
    quantity: number;
    description: string;
    unitPrice: number;
  };
  costs: {
    freight: number;
    insurance: number;
  };
  prepaymentCondition: string;
  balanceCondition: string;
  bank: {
    intermediaryName: string;
    intermediarySwift: string;
    intermediaryAccountNumber?: string;
    intermediaryLocation?: string;
    araNumber?: string;
    localBankName: string;
    localBankSwift: string;
    accountNumber: string;
    beneficiary: string;
  };
  buyerName: string;
  /** Parsed quantity text (e.g. "27,00") — used to anchor the products row in the source. */
  parsedQuantityText?: string;
}

interface DrawCtx {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  debug: boolean;
  layout: PageLayout;
}

interface InjectOptions {
  align?: 'left' | 'right' | 'center';
  bold?: boolean;
  size?: number;
  /** Snap text size to never exceed the rect height. */
  fitToRect?: boolean;
}

const ASCII_ONLY = /[^\x20-\x7E]/g;

function sanitize(s: string): string {
  return (s ?? '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[áàä]/gi, 'a')
    .replace(/[éèë]/gi, 'e')
    .replace(/[íìï]/gi, 'i')
    .replace(/[óòö]/gi, 'o')
    .replace(/[úùü]/gi, 'u')
    .replace(/ñ/gi, 'n')
    .replace(/ç/gi, 'c')
    .replace(ASCII_ONLY, '');
}

function whiteOut(ctx: DrawCtx, rect: Rect, label?: string) {
  ctx.page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.w,
    height: rect.h,
    color: rgb(1, 1, 1),
    opacity: 1,
  });
  if (ctx.debug) {
    ctx.page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      borderColor: rgb(1, 0.3, 0.3),
      borderWidth: 0.5,
      color: rgb(1, 0.95, 0.95),
      opacity: 0.6,
    });
    if (label) {
      ctx.page.drawText(label, {
        x: rect.x + 1,
        y: rect.y + rect.h + 1,
        size: 5,
        font: ctx.font,
        color: rgb(0.85, 0, 0),
      });
    }
  }
}

function injectText(
  ctx: DrawCtx,
  rect: Rect,
  value: string,
  baseline: number,
  options: InjectOptions = {},
) {
  const text = sanitize(value);
  if (!text) return;
  const font = options.bold ? ctx.fontBold : ctx.font;
  const originalSize = options.size ?? rect.fontSize;
  const minSize = Math.max(originalSize - 1.5, 6);
  const usable = rect.w - 2; // leave 1pt of padding each side

  // 1. Try to fit at the original size
  let size = originalSize;
  let fitted = text;
  let textWidth = font.widthOfTextAtSize(fitted, size);

  // 2. Shrink in 0.25pt steps but cap how far we go — once we're
  //    1.5pt below the original we accept that the value just
  //    needs to be truncated rather than rendered at tiny size.
  while (textWidth > usable && size > minSize) {
    size -= 0.25;
    textWidth = font.widthOfTextAtSize(fitted, size);
  }

  // 3. If still doesn't fit, truncate with ellipsis
  if (textWidth > usable) {
    while (fitted.length > 3) {
      fitted = fitted.slice(0, -1);
      const candidate = fitted + '…';
      if (font.widthOfTextAtSize(candidate, size) <= usable) {
        fitted = candidate;
        break;
      }
    }
    textWidth = font.widthOfTextAtSize(fitted, size);
  }

  let x = rect.x + 1;
  if (options.align === 'right') x = rect.x + rect.w - textWidth - 1;
  else if (options.align === 'center')
    x = rect.x + (rect.w - textWidth) / 2;

  ctx.page.drawText(fitted, {
    x,
    y: baseline,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

/**
 * Paint an editable field: white-out + inject. If the rect can't be
 * located we silently skip rather than corrupt the layout.
 */
function paint(
  ctx: DrawCtx,
  fieldName: string,
  located: { rect: Rect; baseline: number } | null,
  value: string,
  options: InjectOptions = {},
) {
  if (!located) return;
  whiteOut(ctx, located.rect, ctx.debug ? fieldName : undefined);
  injectText(ctx, located.rect, value, located.baseline, options);
}

// ----- Section-anchored Bank block painter -----
// The bank block has the structure
//   Intermediary Bank: <name>
//   Swift:             <intermediary swift>
//   Account Number:    <intermediary account>
//   ARA Number:        <ara, if any>
//   Bank Paraguay:     <local bank>
//   Swift:             <local swift>
//   Account Number:    <local account>
//   Beneficiary:       <name + address — multi-line>
//
// We anchor on the three unique labels (Intermediary Bank, Bank Paraguay,
// Beneficiary) and resolve every Swift / Account Number relative to
// those anchors. That sidesteps the global-occurrence bug where the
// 2nd "Swift" / "Account Number" wouldn't replace because of word
// "SWIFT" appearing in the Obs paragraph above, OR pdfjs grouping
// label + value into a single merged text item.
function paintBankSection(ctx: DrawCtx, payload: MirrorPayload) {
  const { layout } = ctx;
  const intermediaryAnchor = findLabel(
    layout,
    'Intermediary Bank',
    'left',
    0,
  );
  const localAnchor = findLabel(layout, 'Bank Paraguay', 'left', 0);
  const beneficiaryAnchor = findLabel(layout, 'Beneficiary', 'left', 0);

  // ---- Intermediary section ----
  if (intermediaryAnchor) {
    paintBelow(
      ctx,
      'Intermediary Bank',
      intermediaryAnchor,
      payload.bank.intermediaryName,
      { bold: true },
    );
    const upperBound = intermediaryAnchor.line.y;
    const lowerBound = localAnchor?.line.y ?? 0;
    paintLabelInRange(
      ctx,
      'Swift',
      payload.bank.intermediarySwift,
      upperBound,
      lowerBound,
    );
    paintLabelInRange(
      ctx,
      'Account Number',
      payload.bank.intermediaryAccountNumber,
      upperBound,
      lowerBound,
    );
    paintLabelInRange(
      ctx,
      'ARA Number',
      payload.bank.araNumber,
      upperBound,
      lowerBound,
    );
  }

  // ---- Local bank section ----
  if (localAnchor) {
    paintBelow(
      ctx,
      'Bank Paraguay',
      localAnchor,
      payload.bank.localBankName,
      { bold: true },
    );
    const upperBound = localAnchor.line.y;
    const lowerBound = beneficiaryAnchor?.line.y ?? 0;
    paintLabelInRange(
      ctx,
      'Swift',
      payload.bank.localBankSwift,
      upperBound,
      lowerBound,
    );
    paintLabelInRange(
      ctx,
      'Account Number',
      payload.bank.accountNumber,
      upperBound,
      lowerBound,
    );
  }

  // ---- Beneficiary (multi-line) ----
  if (beneficiaryAnchor && payload.bank.beneficiary) {
    const values = valueItemsAfter(
      beneficiaryAnchor.line,
      beneficiaryAnchor.labelItem,
      'left',
      layout.width,
    );
    if (values.length > 0) {
      // Capture the orphan continuation lines (e.g. "DELCHACO") that
      // would otherwise survive the white-out.
      const continuation = continuationLines(
        layout,
        beneficiaryAnchor.line,
        values,
        'left',
        layout.width,
      );
      const allItems = [...values, ...continuation];
      const tight = bbox(allItems, 1, 0.5);
      const expanded = expandRectRight(
        tight,
        beneficiaryAnchor.line,
        layout.width,
        'left',
        [beneficiaryAnchor.labelItem, ...allItems],
      );
      paint(
        ctx,
        'bank:Beneficiary',
        { rect: expanded, baseline: values[0].y },
        payload.bank.beneficiary,
      );
    }
  }
}

/**
 * Find the FIRST occurrence of `label` whose Y sits strictly between
 * `upperY` (exclusive, more positive) and `lowerY` (exclusive, more
 * negative). Then white-block + inject. Used to resolve sub-section
 * fields (Swift, Account Number, ARA Number) within a single bank
 * sub-section.
 */
function paintLabelInRange(
  ctx: DrawCtx,
  label: string,
  value: string | undefined,
  upperY: number,
  lowerY: number,
  options: InjectOptions = {},
) {
  if (!value) return;
  const found = findLabelBelow(ctx.layout, label, upperY, 'left');
  if (!found || found.line.y <= lowerY) return;
  paintBelow(ctx, label, found, value, options);
}

/**
 * Given a (line, labelItem) result, extract the value items on the
 * same line, fall back to scanning the next line if same-line is
 * empty (handles cases where pdfjs places label and value on
 * slightly different baselines), then white-block + inject.
 */
function paintBelow(
  ctx: DrawCtx,
  label: string,
  found: { line: { y: number; items: TextRun[] }; labelItem: TextRun },
  value: string,
  options: InjectOptions = {},
) {
  const { layout } = ctx;
  let values = valueItemsAfter(
    found.line,
    found.labelItem,
    'left',
    layout.width,
  );

  // Fallback: pdfjs sometimes puts the value on the line just below
  // the label (esp. when the label is right-padded). Scan within
  // ±6pt and the value's expected X column.
  if (values.length === 0) {
    const minX = found.labelItem.x + found.labelItem.width + 0.5;
    const midX = layout.width / 2;
    const adjacent = layout.lines.find(
      (l) =>
        Math.abs(l.y - found.line.y) <= 6 &&
        l !== found.line &&
        l.items.some((i) => i.x >= minX && i.x < midX - 4),
    );
    if (adjacent) {
      values = adjacent.items.filter(
        (i) => i.x >= minX && i.x < midX - 4,
      );
    }
  }

  if (values.length === 0) return;
  const tight = bbox(values, 1, 0.5);
  const expanded = expandRectRight(
    tight,
    found.line,
    layout.width,
    'left',
    [found.labelItem, ...values],
  );
  paint(
    ctx,
    `bank:${label}`,
    { rect: expanded, baseline: values[0].y },
    value,
    options,
  );
}

/**
 * Buyer signature painter (bottom-right). Uses a fixed wide rect
 * spanning the right column above "BUYER" so longer entity names
 * (e.g. "CHIPA FARM LLC") never truncate to "CHIPA F…".
 */
function paintBuyerSignature(ctx: DrawCtx, name: string) {
  if (!name) return;
  const { layout } = ctx;
  const buyerLabel = locateByText(
    layout,
    (t) => t.trim().toUpperCase() === 'BUYER',
    0,
  );
  if (!buyerLabel) return;

  const midX = layout.width / 2;
  // Find the closest line above the BUYER label that has any
  // right-column content (the existing signature line).
  const candidate = layout.lines
    .filter(
      (l) =>
        l.y > buyerLabel.y &&
        l.y < buyerLabel.y + 30 &&
        l.items.some((i) => i.x >= midX && i.text.trim().length > 1),
    )
    .sort((a, b) => a.y - b.y)[0];
  if (!candidate) return;

  const sigItems = candidate.items.filter((i) => i.x >= midX);
  if (sigItems.length === 0) return;
  const baseline = sigItems[0].y;
  // Use a generous fixed-width band: from midX+12 to pageWidth-14.
  // This guarantees long company names render at full size without
  // shrinking or truncating.
  const sigRect: Rect = {
    x: midX + 12,
    y: baseline - sigItems[0].fontSize * 0.18 - 1.5,
    w: layout.width - midX - 26,
    h: sigItems[0].fontSize * 0.83 + 3,
    fontSize: sigItems[0].fontSize,
  };
  paint(
    ctx,
    'buyerSignature',
    { rect: sigRect, baseline },
    name,
    { bold: true, align: 'center' },
  );
}

export async function generateMirroredContract(
  sourcePdf: ArrayBuffer,
  payload: MirrorPayload,
  options: { debug?: boolean } = {},
): Promise<Uint8Array> {
  // 1. Extract layout from source — this gives us exact rects per field
  const layoutBuf = sourcePdf.slice(0);
  const layout = await extractLayout(layoutBuf);

  // 2. Load the source for editing with pdf-lib
  const pdfBuf = sourcePdf.slice(0);
  const pdfDoc = await PDFDocument.load(pdfBuf);
  const [page] = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawCtx = {
    page,
    font,
    fontBold,
    debug: options.debug ?? false,
    layout,
  };

  // ===== Exporter block (top-left) =====
  paint(
    ctx,
    'exporterName',
    locateLabelValue(layout, 'Exporter', { column: 'left' }),
    payload.exporter.name,
    { bold: true },
  );
  paint(
    ctx,
    'exporterRUC',
    locateLabelValue(layout, 'R.U.C.', { column: 'left' }),
    payload.exporter.ruc,
  );
  paint(
    ctx,
    'exporterAddress',
    locateLabelValue(layout, 'Address', { column: 'left', occurrence: 0 }),
    payload.exporter.address,
  );
  paint(
    ctx,
    'exporterCity',
    locateLabelValue(layout, 'City', { column: 'left', occurrence: 0 }),
    payload.exporter.city,
  );
  paint(
    ctx,
    'exporterCountry',
    locateLabelValue(layout, 'Country', { column: 'left', occurrence: 0 }),
    payload.exporter.country,
  );

  // ===== Client block (mid-upper-left) =====
  paint(
    ctx,
    'clientName',
    locateLabelValue(layout, 'Client', { column: 'left' }),
    payload.client.name,
    { bold: true },
  );
  paint(
    ctx,
    'clientAddress',
    locateLabelValue(layout, 'Address', { column: 'left', occurrence: 1 }),
    payload.client.address,
  );
  paint(
    ctx,
    'clientCity',
    locateLabelValue(layout, 'City', { column: 'left', occurrence: 1 }),
    payload.client.city,
  );
  paint(
    ctx,
    'clientCountry',
    locateLabelValue(layout, 'Country', { column: 'left', occurrence: 1 }),
    payload.client.country,
  );

  // ===== Contact Person (mid-right) =====
  paint(
    ctx,
    'contactPerson',
    locateLabelValue(layout, 'Contact Person', { column: 'right' }),
    payload.contact.name,
  );
  paint(
    ctx,
    'contactPhone',
    locateLabelValue(layout, 'Phone', { column: 'right' }),
    payload.contact.phone,
  );
  // E-mail label appears in BOTH the exporter (Email) and contact
  // (E-mail) blocks. We want the right-column one.
  paint(
    ctx,
    'contactEmail',
    locateLabelValue(layout, 'E-mail', { column: 'right' }),
    payload.contact.email,
  );

  // ===== Payer block =====
  paint(
    ctx,
    'payerName',
    locateLabelValue(layout, 'Payer', { column: 'left' }),
    payload.payer.name,
  );
  paint(
    ctx,
    'payerCountry',
    locateLabelValue(layout, 'Country of Origin of payment to Concepción', {
      column: 'left',
      startsWith: true,
    }),
    payload.payer.country,
  );
  paint(
    ctx,
    'payerCompanyCountry',
    locateLabelValue(layout, 'Country of origin of the company', {
      column: 'left',
      startsWith: true,
    }),
    payload.payer.companyCountry,
  );

  // ===== Products row =====
  // Per PRD §7.2: Quantity and Description are PURE MIRROR (preserve cargo
  // specs exactly). Only Unitary Price and Total Amount are white-blocked.
  // The grand-total row's quantity is also pure mirror; only the amount
  // is recalculated.
  if (payload.parsedQuantityText) {
    const row = locateProductsRow(layout, payload.parsedQuantityText);
    if (row) {
      const qty = payload.product.quantity;
      const unit = payload.product.unitPrice;
      const total = qty * unit;

      paint(
        ctx,
        'productUnitPrice',
        { rect: rectFromItem(row.unitPrice), baseline: row.unitPrice.y },
        formatUnitPrice(unit),
        { align: 'right' },
      );
      paint(
        ctx,
        'productTotal',
        { rect: rectFromItem(row.total), baseline: row.total.y },
        formatMoney(total),
        { align: 'right' },
      );

      // Subtotal/grand-total row — only re-render the amount cell.
      const totals = locateTotalsRow(layout, payload.parsedQuantityText);
      if (totals) {
        paint(
          ctx,
          'totalAmount',
          { rect: rectFromItem(totals.total), baseline: totals.total.y },
          formatMoney(total),
          { align: 'right', bold: true },
        );
      }
    }
  }

  // ===== Payment terms =====
  paint(
    ctx,
    'prepaymentCondition',
    locateLabelValue(layout, 'Prepayment Condition', { startsWith: true }),
    payload.prepaymentCondition,
  );
  paint(
    ctx,
    'balanceCondition',
    locateLabelValue(layout, 'Balance Condition', { startsWith: true }),
    payload.balanceCondition,
  );

  // ===== Freight & Insurance costs =====
  // Layout in source: "Freight cost:" then two number cells side by side.
  // We replace the two cells together as one band.
  const freight = findLabel(layout, 'Freight cost:', 'right');
  if (freight) {
    const after = valueItemsAfter(
      freight.line,
      freight.labelItem,
      'right',
      layout.width,
    );
    if (after.length > 0) {
      const rect = bbox(after, 2, 1.5);
      paint(
        ctx,
        'freightCost',
        { rect, baseline: after[0].y },
        `${formatMoney(payload.costs.freight)}    ${formatMoney(payload.costs.freight)}`,
      );
    }
  }
  const insurance = findLabel(layout, 'Insurance cost:', 'right');
  if (insurance) {
    const after = valueItemsAfter(
      insurance.line,
      insurance.labelItem,
      'right',
      layout.width,
    );
    if (after.length > 0) {
      const rect = bbox(after, 2, 1.5);
      paint(
        ctx,
        'insuranceCost',
        { rect, baseline: after[0].y },
        `${formatMoney(payload.costs.insurance)}    ${formatMoney(payload.costs.insurance)}`,
      );
    }
  }

  // ===== Beneficiary's Bank block (bottom-left) =====
  // We anchor on the three section markers — "Intermediary Bank",
  // "Bank Paraguay", and "Beneficiary" — then resolve the Swift /
  // Account Number labels RELATIVE to those anchors, so the 2nd
  // occurrence is always the correct one even if pdfjs returns a
  // weird ordering or merges label+value into a single text item.
  paintBankSection(ctx, payload);

  // ===== Buyer signature block (bottom-right) =====
  paintBuyerSignature(ctx, payload.buyerName);

  // ===== PDF metadata =====
  pdfDoc.setTitle(`Sales Contract — ${payload.client.name}`);
  pdfDoc.setAuthor(payload.exporter.name);
  pdfDoc.setProducer('TradeMirror OS');
  pdfDoc.setCreator('TradeMirror OS');

  return pdfDoc.save();
}

// ============================================================
// File <-> bytes helpers (kept for backwards compat with callers)
// ============================================================

export function bytesToBlobUrl(bytes: Uint8Array, type = 'application/pdf') {
  const buf = new Uint8Array(bytes.byteLength);
  buf.set(bytes);
  const blob = new Blob([buf], { type });
  return URL.createObjectURL(blob);
}

export async function downloadPdf(
  bytes: Uint8Array,
  fileName: string,
): Promise<void> {
  const buf = new Uint8Array(bytes.byteLength);
  buf.set(bytes);
  const blob = new Blob([buf], { type: 'application/pdf' });
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  // --- Primary path: object URL (works on all modern browsers incl. iOS Safari) ---
  // On iOS, window.open() with a blob URL opens the PDF in a new tab
  // where the user can tap "Open in…" / "Save to Files". This is the most
  // reliable experience. On desktop we use a hidden <a download> instead.
  const canCreateObjectUrl =
    typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';

  if (canCreateObjectUrl) {
    const url = URL.createObjectURL(blob);
    if (isIOS) {
      // iOS Safari: open in new tab → user taps share icon → Save to Files
      window.open(url, '_blank');
    } else {
      // Desktop / Android: trigger a direct download via hidden anchor
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    // Revoke after a generous delay so the browser has time to read the blob
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    return;
  }

  // --- Secondary path: Web Share API (only reached in very old WebViews
  // where createObjectURL is unavailable — practically never on modern iOS) ---
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (
    nav &&
    typeof (nav as Navigator).share === 'function' &&
    typeof (nav as Navigator).canShare === 'function'
  ) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if ((nav as Navigator).canShare({ files: [file] })) {
        await (nav as Navigator).share({ files: [file], title: fileName });
        return;
      }
    } catch {
      // AbortError (user dismissed sheet) or NotAllowedError — fall through
    }
  }

  // --- Last resort: data URL via FileReader (very old browsers) ---
  await new Promise<void>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') window.open(result, '_blank');
      resolve();
    };
    reader.onerror = () => resolve();
    reader.readAsDataURL(blob);
  });
}

async function readWithFileReader(file: File): Promise<ArrayBuffer> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('FileReader returned non-ArrayBuffer result'));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  try {
    const ab = await file.arrayBuffer();
    if (ab.byteLength > 0) return ab;
  } catch {
    // fall through to FileReader
  }
  return await readWithFileReader(file);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

export function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',').pop() ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
