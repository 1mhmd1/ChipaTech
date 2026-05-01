// ============================================================
// PDF Parser
// Extracts structured fields from a Frigorifico Concepcion
// supplier contract PDF. Uses pdfjs-dist (browser-friendly
// equivalent of pdf-parse). The returned object feeds the
// Contract Editor and the mirror generator.
// ============================================================

import type { ParsedContract } from '../../types';

let pdfjsWorkerReady = true;

// Lazy-load pdfjs to keep the initial bundle slim
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  // Use the legacy worker for compatibility
  try {
    const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjsWorkerReady = true;
  } catch (err) {
    // Mobile browsers or CSP can block module workers.
    // We'll fall back to main-thread parsing instead.
    pdfjsWorkerReady = false;
  }
  return pdfjsLib;
}

function isLikelyMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

async function getPdfDocument(
  pdfjs: typeof import('pdfjs-dist'),
  data: ArrayBuffer,
) {
  try {
    return await pdfjs.getDocument({
      data,
      disableWorker: isLikelyMobile() ? true : !pdfjsWorkerReady,
    }).promise;
  } catch (err) {
    return await pdfjs.getDocument({ data, disableWorker: true }).promise;
  }
}

// Group text items by line based on Y coordinate, then sort by X
interface LineItem {
  y: number;
  segments: { x: number; text: string }[];
}

async function extractLines(file: ArrayBuffer): Promise<string[]> {
  const pdfjs = await loadPdfjs();
  const doc = await getPdfDocument(pdfjs, file);
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();

    // Group into lines by Y coordinate (rounded to 2 px tolerance)
    const linesMap = new Map<number, LineItem>();
    for (const item of tc.items as Array<{
      str: string;
      transform: number[];
    }>) {
      const x = item.transform[4];
      const y = Math.round(item.transform[5]);
      if (!linesMap.has(y)) linesMap.set(y, { y, segments: [] });
      linesMap.get(y)!.segments.push({ x, text: item.str });
    }
    const sorted = [...linesMap.values()].sort((a, b) => b.y - a.y);
    for (const line of sorted) {
      const text = line.segments
        .sort((a, b) => a.x - b.x)
        .map((s) => s.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) lines.push(text);
    }
  }
  return lines;
}

// Robust number parser tolerant of "2.100,000" "56.700,00" "1,234.56"
function parseNumber(raw?: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[A-Za-z$\s]/g, '')
    .replace(/U\$/g, '')
    .trim();
  if (!cleaned) return 0;
  // If both . and , present, assume European: . = thousand, , = decimal
  if (cleaned.includes('.') && cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes(',')) {
    // Last , is decimal separator
    const lastComma = cleaned.lastIndexOf(',');
    const intPart = cleaned.slice(0, lastComma).replace(/[.,]/g, '');
    const decPart = cleaned.slice(lastComma + 1);
    return parseFloat(`${intPart}.${decPart}`) || 0;
  }
  return parseFloat(cleaned) || 0;
}

function findAfter(lines: string[], anchor: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (anchor.test(lines[i])) {
      const m = lines[i].match(anchor);
      if (m && m[1]) return m[1].trim();
      const next = lines[i + 1];
      if (next) return next.trim();
    }
  }
  return undefined;
}

export async function parseSupplierContract(
  file: ArrayBuffer,
): Promise<ParsedContract> {
  const lines = await extractLines(file);
  const text = lines.join('\n');

  // Contract reference
  const contractRefMatch = text.match(/Contract\s*No\.?\s*:?\s*([0-9/-]+)/i);
  const contractRef = contractRefMatch ? contractRefMatch[1] : '';

  // Exporter block
  const exporterName =
    findAfter(lines, /^Exporter\b\s*(.*)$/i) || 'FRIGORIFICO CONCEPCION S.A';
  const ruc = findAfter(lines, /^R\.?U\.?C\.?\b\s*(.*)$/i) || '80023325-5';
  const exporterAddress =
    findAfter(lines, /^Address\b\s*(.*)$/i) || 'KM 6,5 CAMINO AEROPUERTO';
  const exporterCity = findAfter(lines, /^City\b\s*(.*)$/i) || 'CONCEPCION';
  const exporterCountry = findAfter(lines, /^Country\b\s*(.*)$/i) || 'PARAGUAY';

  // Sales person
  const salesPerson = findAfter(lines, /^Sales\s*Person\b\s*(.*)$/i);
  const salesAssistant = findAfter(lines, /^Sales\s*Assistant\b\s*(.*)$/i);
  const dateOfIssue = findAfter(lines, /^Date\s*of\s*Issue\b\s*(.*)$/i);
  const exporterEmail = findAfter(lines, /^Email\b\s*(.*)$/i);

  // Client block (second occurrence of Address/City/Country)
  const clientName = findAfter(lines, /^Client\b\s*(.*)$/i);
  const addressOccurrences = lines
    .map((l, i) => (/^Address\b/i.test(l) ? i : -1))
    .filter((i) => i >= 0);
  let clientAddress: string | undefined;
  let clientCity: string | undefined;
  let clientCountry: string | undefined;
  if (addressOccurrences.length >= 2) {
    clientAddress = lines[addressOccurrences[1]]
      .replace(/^Address\s*/i, '')
      .trim();
  }
  const cityOccurrences = lines
    .map((l, i) => (/^City\b/i.test(l) ? i : -1))
    .filter((i) => i >= 0);
  if (cityOccurrences.length >= 2) {
    clientCity = lines[cityOccurrences[1]].replace(/^City\s*/i, '').trim();
  }
  const countryOccurrences = lines
    .map((l, i) => (/^Country\b/i.test(l) ? i : -1))
    .filter((i) => i >= 0);
  if (countryOccurrences.length >= 2) {
    clientCountry = lines[countryOccurrences[1]]
      .replace(/^Country\s*/i, '')
      .trim();
  }

  // Contact Person
  const contactPerson = findAfter(lines, /^Contact\s*Person\b\s*(.*)$/i);
  const contactPhone = findAfter(lines, /^Phone\b\s*(.*)$/i);
  const contactEmail = findAfter(lines, /^E-?mail\b\s*(.*)$/i);

  // Payer
  const payerName = findAfter(lines, /^Payer\b\s*(.*)$/i);
  const payerCountry = findAfter(
    lines,
    /^Country\s*of\s*Origin\s*of\s*payment\s*to\s*Concepci[oó]n\s*(.*)$/i,
  );
  const payerCompanyCountry = findAfter(
    lines,
    /^Country\s*of\s*origin\s*of\s*the\s*company\s*(.*)$/i,
  );

  // Products: look for the row with Quantity description + total
  // Pattern in source: "27,00 FROZEN OFFALS BOVINE LIVER, CARTONS WITH 10KG FIX WEIGHT IN BAGS 2.100,000 56.700,00"
  let quantity = 0;
  let productDescription = '';
  let unitPrice = 0;
  let totalAmount = 0;

  for (const line of lines) {
    const m = line.match(
      /^([0-9.,]+)\s+(.+?)\s+([0-9.,]{4,})\s+([0-9.,]{4,})$/,
    );
    if (m && /[A-Z]{3,}/.test(m[2])) {
      quantity = parseNumber(m[1]);
      productDescription = m[2].trim();
      unitPrice = parseNumber(m[3]);
      totalAmount = parseNumber(m[4]);
      break;
    }
  }

  // Specs (left column)
  const brand = findAfter(lines, /^Brand\b\s*(.*)$/i);
  const validity = findAfter(lines, /^Validity\b\s*(.*)$/i);
  const temperature = findAfter(lines, /^Temperature\b\s*(.*)$/i);
  const packing = findAfter(lines, /^Packing\b\s*(.*)$/i);
  const shipmentDate = findAfter(lines, /^Shipment'?s?\s*Date\b\s*(.*)$/i);
  const origin = findAfter(lines, /^Origin\b\s*(.*)$/i);
  const destination = findAfter(lines, /^Destination\b\s*(.*)$/i);
  const incoterm = findAfter(lines, /^Incoterm\s*:?\s*(.*)$/i);
  const plantNo = findAfter(lines, /^Plant\s*No\.?\s*:?\s*(.*)$/i);
  const freightCondition = findAfter(lines, /^Freight\s*Condition\b\s*(.*)$/i);
  const lawAndJurisdiction = findAfter(
    lines,
    /^Law\s*and\s*Jurisdiction\b\s*(.*)$/i,
  );
  const requiresInspection = findAfter(
    lines,
    /^Requires\s*Inspection\b\s*(.*)$/i,
  );

  // Freight / Insurance costs (typically two columns of zeros)
  const freightLine = lines.find((l) => /^Freight\s*cost/i.test(l));
  const insuranceLine = lines.find((l) => /^Insurance\s*cost/i.test(l));
  const freightCost = freightLine
    ? parseNumber((freightLine.match(/[\d.,]+/) || [])[0])
    : 0;
  const insuranceCost = insuranceLine
    ? parseNumber((insuranceLine.match(/[\d.,]+/) || [])[0])
    : 0;

  // Payment conditions
  const prepaymentCondition = findAfter(
    lines,
    /^Prepayment\s*Condition\b\s*(.*)$/i,
  );
  const balanceCondition = findAfter(lines, /^Balance\s*Condition\b\s*(.*)$/i);

  // Observations — take everything after "Obs:" until "Incoterm:" or specs section
  const obsIdx = lines.findIndex((l) => /^Obs\s*:/i.test(l));
  let observations: string | undefined;
  if (obsIdx >= 0) {
    const collected: string[] = [];
    let line = lines[obsIdx].replace(/^Obs\s*:\s*/i, '');
    if (line) collected.push(line);
    for (let i = obsIdx + 1; i < lines.length; i++) {
      if (/^(Incoterm|Brand|Plant|Freight\s*cost|Insurance)/i.test(lines[i]))
        break;
      collected.push(lines[i]);
    }
    observations = collected.join(' ').trim();
  }

  // Bank
  const beneficiary = findAfter(lines, /^Beneficiary\b\s*(.*)$/i);
  const intermediaryBank = findAfter(lines, /^Intermediary\s*Bank\b\s*(.*)$/i);
  const bankParaguay = findAfter(lines, /^Bank\s*Paraguay\b\s*(.*)$/i);
  // Two SWIFT lines and two Account Number lines exist; first SWIFT belongs to
  // intermediary, second to local bank. Same for Account Number.
  const swifts = lines.filter((l) => /^Swift\b/i.test(l));
  const accountNums = lines.filter((l) => /^Account\s*Number\b/i.test(l));
  const intermediarySwift = swifts[0]
    ?.replace(/^Swift\s*/i, '')
    .trim();
  const bankSwift = swifts[1]?.replace(/^Swift\s*/i, '').trim();
  const intermediaryAccountNumber = accountNums[0]
    ?.replace(/^Account\s*Number\s*/i, '')
    .trim();
  const accountNumber = accountNums[1]
    ?.replace(/^Account\s*Number\s*/i, '')
    .trim();
  const araNumber = findAfter(lines, /^ARA\s*Number\b\s*(.*)$/i);
  // Intermediary location often appears as a stand-alone line after the SWIFT
  // (e.g. "NEW YORK, USA"). Best-effort extraction:
  const intermediaryLocationIdx = lines.findIndex(
    (l) => /NEW YORK/i.test(l) && /USA/i.test(l),
  );
  const intermediaryLocation =
    intermediaryLocationIdx >= 0 ? lines[intermediaryLocationIdx] : undefined;

  return {
    contractRef,
    exporterName,
    exporterRUC: ruc,
    exporterAddress,
    exporterCity,
    exporterCountry,

    salesPerson,
    salesAssistant,
    dateOfIssue,
    exporterEmail,

    clientName,
    clientAddress,
    clientCity,
    clientCountry,

    contactPerson,
    contactPhone,
    contactEmail,

    payerName,
    payerCountry,
    payerCompanyCountry,

    quantity,
    productDescription,
    unitPrice,
    totalAmount,

    brand,
    validity,
    temperature,
    packing,
    shipmentDate,
    origin,
    destination,
    incoterm,
    plantNo,
    freightCondition,
    freightCost,
    insuranceCost,
    prepaymentCondition,
    balanceCondition,
    observations,
    lawAndJurisdiction,
    requiresInspection,

    beneficiaryName: beneficiary,
    intermediaryBank,
    intermediarySwift,
    intermediaryAccountNumber,
    intermediaryLocation,
    bankParaguay,
    bankSwift,
    accountNumber,
    araNumber,
  };
}
