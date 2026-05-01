// ============================================================
// PDF Layout Extractor
// Pulls every text run out of the source PDF with exact (x, y,
// width, height, fontSize) and offers helpers that find the
// rectangle for a given editable field — by label, column,
// occurrence, or content match.
//
// This is the foundation of the new mirroring engine: instead
// of guessing pixel coordinates, we use the source PDF's own
// layout as the single source of truth.
// ============================================================

import { openPdfDocument } from "./pdfjs-loader";

// ---------- Types ----------
export interface TextRun {
  text: string;
  x: number; // PDF coordinates: bottom-left origin
  y: number; // baseline Y
  width: number;
  height: number;
  fontSize: number;
}

export interface LayoutLine {
  y: number;
  items: TextRun[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
}

export interface PageLayout {
  width: number;
  height: number;
  items: TextRun[];
  lines: LayoutLine[];
}

// ---------- Extraction ----------
export async function extractLayout(bytes: ArrayBuffer): Promise<PageLayout> {
  const doc = await openPdfDocument(bytes);
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const tc = await page.getTextContent();

  const items: TextRun[] = [];
  for (const it of tc.items as Array<{
    str: string;
    transform: number[];
    width: number;
    height: number;
  }>) {
    const text = it.str;
    if (!text || !text.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const fontSize = Math.abs(it.transform[3]) || 8;
    items.push({
      text,
      x,
      y,
      width: it.width,
      height: it.height || fontSize,
      fontSize,
    });
  }

  return {
    width: viewport.width,
    height: viewport.height,
    items,
    lines: groupIntoLines(items),
  };
}

function groupIntoLines(items: TextRun[], tolerance = 3): LayoutLine[] {
  // Tolerance bumped from 2 → 3 because some label/value pairs in
  // the source PDF have a 2.5pt baseline drift between them, which
  // would otherwise split them onto separate "lines" and break
  // value extraction (cf. the 2nd Swift / 2nd Account Number).
  const lines: LayoutLine[] = [];
  const sorted = [...items].sort((a, b) => b.y - a.y);
  for (const it of sorted) {
    const existing = lines.find((l) => Math.abs(l.y - it.y) <= tolerance);
    if (existing) existing.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

// ---------- Locator helpers ----------

const norm = (s: string) =>
  s
    .replace(/[\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export type Column = "left" | "right" | "any";

function isInColumn(x: number, column: Column, midX: number): boolean {
  if (column === "any") return true;
  if (column === "left") return x < midX;
  return x >= midX;
}

/** Find a label item by exact text match, with column + occurrence filtering. */
export function findLabel(
  layout: PageLayout,
  label: string,
  column: Column = "any",
  occurrence = 0,
): { line: LayoutLine; labelItem: TextRun } | null {
  const target = norm(label);
  const midX = layout.width / 2;
  let count = 0;
  for (const line of layout.lines) {
    for (const item of line.items) {
      if (norm(item.text) === target && isInColumn(item.x, column, midX)) {
        if (count === occurrence) return { line, labelItem: item };
        count++;
      }
    }
  }
  return null;
}

/** Loose match for multi-token labels (e.g. "Prepayment Condition"). */
export function findLabelStartsWith(
  layout: PageLayout,
  prefix: string,
  column: Column = "any",
  occurrence = 0,
): { line: LayoutLine; labelItem: TextRun } | null {
  const target = norm(prefix);
  const midX = layout.width / 2;
  let count = 0;
  for (const line of layout.lines) {
    for (const item of line.items) {
      if (
        norm(item.text).startsWith(target) &&
        isInColumn(item.x, column, midX)
      ) {
        if (count === occurrence) return { line, labelItem: item };
        count++;
      }
    }
  }
  return null;
}

/**
 * Find a label that appears strictly BELOW a given Y (i.e. lower
 * on the page — smaller Y in PDF coords). Used to anchor sub-section
 * labels: "the next 'Swift' after 'Bank Paraguay'", which fixes the
 * 2nd-occurrence bug where global occurrence counting was unreliable
 * (e.g. when the word "SWIFT" appears in the Obs paragraph above).
 */
export function findLabelBelow(
  layout: PageLayout,
  label: string,
  belowY: number,
  column: Column = "any",
  startsWith = false,
): { line: LayoutLine; labelItem: TextRun } | null {
  const target = norm(label);
  const midX = layout.width / 2;
  for (const line of layout.lines) {
    if (line.y >= belowY) continue;
    for (const item of line.items) {
      const t = norm(item.text);
      const matches = startsWith ? t.startsWith(target) : t === target;
      if (matches && isInColumn(item.x, column, midX)) {
        return { line, labelItem: item };
      }
    }
  }
  return null;
}

/**
 * Get the value items immediately following a label on the same line,
 * constrained to a column. Stops if a gap larger than `gapStop` opens up
 * (typically because the next column starts).
 */
export function valueItemsAfter(
  line: LayoutLine,
  labelItem: TextRun,
  column: Column,
  pageWidth: number,
  gapStop = 60,
): TextRun[] {
  const midX = pageWidth / 2;
  const minX = labelItem.x + labelItem.width + 0.5;
  let maxX: number;
  if (column === "left") maxX = midX - 2;
  else if (column === "right") maxX = pageWidth - 4;
  else maxX = pageWidth - 4;

  const candidates = line.items
    .filter((i) => i !== labelItem && i.x >= minX && i.x <= maxX)
    .sort((a, b) => a.x - b.x);

  // Cluster contiguous items; stop if a gap > gapStop appears
  const out: TextRun[] = [];
  let prevRight = minX;
  for (const it of candidates) {
    if (it.x - prevRight > gapStop && out.length > 0) break;
    out.push(it);
    prevRight = it.x + it.width;
  }
  return out;
}

/**
 * Bounding box around a list of text runs.
 *
 * Vertical extent uses fontSize (not pdfjs's `item.height`, which
 * is sometimes the full line-height — that caused the white-out
 * to overlap the horizontal divider line *above* a section, e.g.
 * the rule above the Client / Contact blocks).
 *
 * cap-height ≈ 0.65 × fontSize, descender ≈ 0.18 × fontSize, so a
 * tight glyph box is +0.65 / -0.18 from the baseline, padded by
 * `padY` on each side.
 */
export function bbox(items: TextRun[], padX = 1, padY = 0.5): Rect {
  if (items.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0, fontSize: 8 };
  }
  const xs = items.map((i) => i.x);
  const xe = items.map((i) => i.x + i.width);
  const tops = items.map((i) => i.y + i.fontSize * 0.65);
  const bottoms = items.map((i) => i.y - i.fontSize * 0.18);
  const minX = Math.min(...xs) - padX;
  const maxX = Math.max(...xe) + padX;
  const minY = Math.min(...bottoms) - padY;
  const maxY = Math.max(...tops) + padY;
  const sizes = items.map((i) => i.fontSize).sort((a, b) => a - b);
  const fontSize = sizes[Math.floor(sizes.length / 2)] || 8;
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
    fontSize,
  };
}

/**
 * Expand a rect rightward to the next non-value item on the line
 * (or the column boundary). This gives the new value text room
 * to render at its original size when it's longer than the
 * original — e.g. "NILE PROTEIN IMPORTS S.A.E." replacing
 * "CHIPA TECH E.A.S.". The white-out is harmless on empty space,
 * and we never cross into another field's territory.
 */
export function expandRectRight(
  rect: Rect,
  line: LayoutLine,
  pageWidth: number,
  column: Column,
  guards: TextRun[],
): Rect {
  // Leave 8pt of clearance from column boundaries so the white-out
  // doesn't graze the vertical separator lines (the small dot
  // artifacts in the previous render).
  const midX = pageWidth / 2;
  const colEnd = column === "left" ? midX - 8 : pageWidth - 12;
  const guardSet = new Set(guards);
  const blocker = line.items
    .filter((i) => !guardSet.has(i))
    .filter((i) => i.x >= rect.x + rect.w - 0.5)
    .filter((i) => i.x <= colEnd + 6)
    .sort((a, b) => a.x - b.x)[0];
  const rightEdge = blocker ? Math.min(blocker.x - 5, colEnd) : colEnd;
  const newWidth = Math.max(rect.w, rightEdge - rect.x);
  return { ...rect, w: newWidth };
}

/**
 * Capture the items that visually CONTINUE a value onto subsequent
 * lines — used for multi-line fields like Beneficiary, where the
 * source PDF wraps "FRIGORIFICO CONCEPCION S.A ADDRESS: SANTA
 * TERESA Y AVIADORES / DELCHACO" across two lines and we need to
 * white-block both so the orphan "DELCHACO" doesn't survive.
 *
 * Heuristic: look at lines below the label's line whose items fall
 * within the value's X-band and whose Y is within `maxLines * 14pt`
 * of the original line. Stop at the first line that doesn't satisfy
 * the X-band (likely a different field).
 */
export function continuationLines(
  layout: PageLayout,
  labelLine: LayoutLine,
  valueItems: TextRun[],
  column: Column,
  pageWidth: number,
  maxLines = 3,
): TextRun[] {
  if (valueItems.length === 0) return [];
  const midX = pageWidth / 2;
  const valueLeftEdge = Math.min(...valueItems.map((v) => v.x)) - 4;
  const colEnd = column === "left" ? midX - 4 : pageWidth - 8;
  const collected: TextRun[] = [];
  let lastY = labelLine.y;
  let count = 0;
  for (const line of layout.lines) {
    if (line.y >= labelLine.y) continue;
    if (lastY - line.y > 18) break; // gap too big — different section
    const within = line.items.filter(
      (i) => i.x >= valueLeftEdge && i.x <= colEnd,
    );
    if (within.length === 0) break;
    collected.push(...within);
    lastY = line.y;
    count++;
    if (count >= maxLines) break;
  }
  return collected;
}

/** Locate the rect for "label X → value" pattern in one call. */
export function locateLabelValue(
  layout: PageLayout,
  label: string,
  options: {
    column?: Column;
    occurrence?: number;
    startsWith?: boolean;
  } = {},
): { rect: Rect; baseline: number; firstItem: TextRun } | null {
  const finder = options.startsWith ? findLabelStartsWith : findLabel;
  const found = finder(
    layout,
    label,
    options.column ?? "any",
    options.occurrence ?? 0,
  );
  if (!found) return null;
  const column = options.column ?? "any";
  const values = valueItemsAfter(
    found.line,
    found.labelItem,
    column,
    layout.width,
  );
  if (values.length === 0) return null;
  // Tight bbox around the original text first…
  const tight = bbox(values, 2, 0.5);
  // …then expand rightward into available column space so a
  // longer replacement value can render at the original font size.
  const expanded = expandRectRight(tight, found.line, layout.width, column, [
    found.labelItem,
    ...values,
  ]);
  return {
    rect: expanded,
    baseline: values[0].y,
    firstItem: values[0],
  };
}

/** Locate by content match — useful for the products row & buyer name. */
export function locateByText(
  layout: PageLayout,
  predicate: (text: string) => boolean,
  occurrence = 0,
): TextRun | null {
  let count = 0;
  for (const line of layout.lines) {
    for (const item of line.items) {
      if (predicate(item.text)) {
        if (count === occurrence) return item;
        count++;
      }
    }
  }
  return null;
}

/**
 * Find the products row: the first line whose first item is a number
 * matching the parsed quantity. Returns the four cell rects.
 */
export function locateProductsRow(
  layout: PageLayout,
  parsedQuantityText: string,
): {
  qty: TextRun;
  description: { rect: Rect; baseline: number };
  unitPrice: TextRun;
  total: TextRun;
} | null {
  const target = norm(parsedQuantityText);
  for (const line of layout.lines) {
    if (line.items.length < 3) continue;
    const first = line.items[0];
    if (norm(first.text) !== target) continue;
    // Make sure this line has at least one large number near the right edge
    const last = line.items[line.items.length - 1];
    if (!/^[\d.,]+$/.test(last.text.trim())) continue;
    const secondLast = line.items[line.items.length - 2];
    if (!secondLast || !/^[\d.,]+$/.test(secondLast.text.trim())) continue;

    const descItems = line.items.slice(1, -2);
    return {
      qty: first,
      description: {
        rect: bbox(descItems, 2, 1.5),
        baseline: descItems[0]?.y ?? first.y,
      },
      unitPrice: secondLast,
      total: last,
    };
  }
  return null;
}

/** Find the "Total" subtotal row that mirrors the product row. */
export function locateTotalsRow(
  layout: PageLayout,
  parsedQuantityText: string,
): { qty: TextRun; total: TextRun } | null {
  const target = norm(parsedQuantityText);
  let seenFirst = false;
  for (const line of layout.lines) {
    const first = line.items[0];
    if (!first) continue;
    if (norm(first.text) === target) {
      if (!seenFirst) {
        seenFirst = true;
        continue;
      }
      const last = line.items[line.items.length - 1];
      if (last && /^[\d.,]+$/.test(last.text.trim())) {
        return { qty: first, total: last };
      }
    }
  }
  return null;
}

export function rectFromItem(item: TextRun, padX = 2, padY = 0.5): Rect {
  return {
    x: item.x - padX,
    y: item.y - item.fontSize * 0.18 - padY,
    w: item.width + 2 * padX,
    h: item.fontSize * 0.83 + 2 * padY,
    fontSize: item.fontSize,
  };
}
