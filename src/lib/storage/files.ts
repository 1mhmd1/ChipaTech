// ============================================================
// Document blob storage abstraction
//
// In Supabase mode, files live in the `trade-documents` bucket
// and we record the storage path on the document row.
// In demo mode, we still inline the bytes as a data URL so the
// localStorage backend has everything it needs to round-trip.
// Both modes go through the same two helpers so callers don't
// branch on the backend.
// ============================================================

import { isSupabaseEnabled } from '../supabase/client';
import {
  bytesToBase64,
  base64ToBytes,
} from '../pdf/generator';
import {
  downloadDocument,
  uploadDocument,
} from '../supabase/repos';
import type { DocumentType } from '../../types';

/**
 * Persist a binary document, returning the value that should be
 * stored in `documents.storage_path`. Demo mode → data URL.
 * Supabase mode → object path.
 */
export async function saveDocumentBlob(
  tradeId: string,
  type: DocumentType,
  bytes: Uint8Array,
  fileName: string,
): Promise<string> {
  if (isSupabaseEnabled()) {
    return await uploadDocument(tradeId, type, bytes, fileName);
  }
  return bytesToBase64(bytes);
}

/** Read back a document blob using its stored `storage_path`. */
export async function loadDocumentBlob(path: string): Promise<Uint8Array> {
  if (path.startsWith('data:')) return base64ToBytes(path);
  return await downloadDocument(path);
}
