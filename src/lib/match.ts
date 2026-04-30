// ============================================================
// Lightweight fuzzy matcher used for "smart auto-fill" — when
// a supplier PDF parses to a client name, we try to find an
// existing record before falling back to "create new".
//
// Strategy: token-set ratio. Tokenize both strings, intersect,
// score = 2·|intersection| / (|a| + |b|). Cheap, no deps,
// handles "ABC TRADING S.A." vs "Abc Trading SA" reasonably.
// ============================================================

const STOP_TOKENS = new Set([
  'the',
  'and',
  'co',
  'inc',
  'llc',
  'sa',
  'sas',
  'sarl',
  'srl',
  'eas',
  'ltd',
  'limited',
  'corp',
  'company',
  'group',
  'trading',
  'imports',
  'export',
]);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[.,'’"`()&\-+/\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length > 1);
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  // Strip stop-tokens for the bulk of the score, but keep them
  // available so identical companies that differ only in suffix
  // still match strongly.
  const aMeaningful = aTokens.filter((t) => !STOP_TOKENS.has(t));
  const bMeaningful = bTokens.filter((t) => !STOP_TOKENS.has(t));
  const aSet = aMeaningful.length ? aMeaningful : aTokens;
  const bSet = bMeaningful.length ? bMeaningful : bTokens;

  const inter = aSet.filter((t) => bSet.includes(t));
  const denom = aSet.length + bSet.length;
  const tokenScore = denom === 0 ? 0 : (2 * inter.length) / denom;

  // Boost if either name is a substring of the other
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const subBoost = al.includes(bl) || bl.includes(al) ? 0.15 : 0;

  return Math.min(1, tokenScore + subBoost);
}

export interface MatchCandidate<T> {
  item: T;
  score: number;
}

export function bestMatch<T>(
  needle: string,
  haystack: T[],
  toString: (item: T) => string,
  threshold = 0.55,
): MatchCandidate<T> | null {
  if (!needle || haystack.length === 0) return null;
  let best: MatchCandidate<T> | null = null;
  for (const item of haystack) {
    const score = similarity(needle, toString(item));
    if (!best || score > best.score) best = { item, score };
  }
  if (!best || best.score < threshold) return null;
  return best;
}

export function rankMatches<T>(
  needle: string,
  haystack: T[],
  toString: (item: T) => string,
  limit = 3,
): MatchCandidate<T>[] {
  if (!needle) return [];
  return haystack
    .map((item) => ({ item, score: similarity(needle, toString(item)) }))
    .filter((m) => m.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
