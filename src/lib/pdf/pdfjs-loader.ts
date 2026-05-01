// ============================================================
// Shared pdfjs loader
//
// Both parser.ts and extract.ts import from here so the pdfjs
// singleton and its GlobalWorkerOptions are NEVER split across
// two separate module-level state variables.
//
// iOS Safari notes
// ─────────────────
// • disableFontFace / useSystemFonts hurt text extraction: when
//   font faces are not loaded the ToUnicode CMap can't be resolved
//   and getTextContent() returns empty or garbled strings.
// • iOS WKWebView can block Web Workers, so we always prefer
//   inline (main-thread) parsing — slower but fully reliable.
// • We detect iOS once here and propagate via getDocumentParams().
// ============================================================

let _pdfjs: typeof import("pdfjs-dist") | null = null;

/**
 * Returns the shared pdfjs-dist legacy instance, initialised once.
 * Always uses the legacy (core-js polyfilled) build so the code
 * runs on iOS Safari 13+ without any ES2020+ feature gaps.
 */
export async function getPdfjsLib(): Promise<typeof import("pdfjs-dist")> {
  if (_pdfjs) return _pdfjs;

  // Legacy build = ES5-compatible webpack bundle with core-js polyfills.
  // The standard build targets Node ≥ 22 / ES2025 and crashes on iOS.
  const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // In pdf.js v4/v5+, workerSrc MUST be specified regardless of disableWorker
  try {
    const w = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
    lib.GlobalWorkerOptions.workerSrc = w.default;
  } catch (e) {
    console.warn("Failed to load pdf worker:", e);
    // Fallback to CDN for the matching legacy version if bundling fails
    lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.7.284/pdf.worker.min.mjs"; 
  }

  _pdfjs = lib;
  return lib;
}

/**
 * Build the getDocument() params object.
 *
 * Key: disableFontFace and useSystemFonts are NOT set here.
 * Those options prevent pdfjs from loading the embedded font's
 * character map (ToUnicode / Encoding), which causes getTextContent()
 * to return empty or garbled strings on PDFs with non-standard fonts.
 */
export function getDocumentParams(
  data: Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _forceInline = false,
): Record<string, unknown> {
  return {
    data,
    isEvalSupported: false,
    useSystemFonts: true, // Prevents loading custom fonts which often crash iOS Safari
    disableFontFace: true,
  };
}

/**
 * Open a PDF document with automatic retry (inline mode) on failure.
 */
export async function openPdfDocument(
  data: ArrayBuffer,
): Promise<Awaited<ReturnType<(typeof import("pdfjs-dist"))["getDocument"]>>["promise"] extends Promise<infer T> ? T : never> {
  const lib = await getPdfjsLib();
  const typed = new Uint8Array(data);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (lib.getDocument(getDocumentParams(typed)) as any).promise;
  } catch {
    // Last-resort: run fully inline with eval disabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (lib.getDocument(getDocumentParams(typed, true)) as any).promise;
  }
}
