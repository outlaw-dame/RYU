/**
 * Phase 27: Author name normalizer.
 *
 * Handles "First Last", "Last, First", initials matching,
 * and common name variations to detect author aliases.
 */

/**
 * Normalize a string for comparison: lowercase, strip punctuation,
 * collapse whitespace, and normalize unicode.
 */
export function normalizeForComparison(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a name into components (given names, family name).
 * Handles "Last, First" and "First Last" formats.
 */
export function parseAuthorName(name: string): { given: string[]; family: string } {
  const trimmed = name.trim();

  // "Last, First Middle" format
  if (trimmed.includes(',')) {
    const [familyPart, ...givenParts] = trimmed.split(',').map((s) => s.trim());
    const givenTokens = givenParts.join(' ').split(/\s+/).filter(Boolean);
    return { given: givenTokens, family: familyPart };
  }

  // "First Middle Last" format
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { given: [], family: '' };
  if (tokens.length === 1) return { given: [], family: tokens[0] };

  const family = tokens[tokens.length - 1];
  const given = tokens.slice(0, -1);
  return { given, family };
}

/**
 * Convert a name to a canonical form: "family, given1 given2".
 */
export function canonicalizeAuthorName(name: string): string {
  const parsed = parseAuthorName(name);
  const normFamily = normalizeForComparison(parsed.family);
  const normGiven = parsed.given.map(normalizeForComparison).filter(Boolean);

  if (!normFamily) return normGiven.join(' ');
  if (normGiven.length === 0) return normFamily;
  return `${normFamily}, ${normGiven.join(' ')}`;
}

/**
 * Check if a token could be an initial for a full name.
 * "J" or "j" matches "John", "J." matches "John".
 */
function isInitialOf(initial: string, fullName: string): boolean {
  const cleanInitial = initial.replace(/\./g, '').toLowerCase();
  if (cleanInitial.length !== 1) return false;
  return fullName.toLowerCase().startsWith(cleanInitial);
}

/**
 * Compare two author names and determine if they likely refer to the same person.
 * Returns a confidence score from 0.0 to 1.0.
 *
 * Matching rules:
 * - Exact canonical match: 1.0
 * - Family name match + given names are initials of each other: 0.85
 * - Family name match + one side has no given names: 0.7
 * - Family name match + partial given name overlap: 0.6
 * - No family name match: 0.0
 */
export function compareAuthorNames(nameA: string, nameB: string): number {
  const canonA = canonicalizeAuthorName(nameA);
  const canonB = canonicalizeAuthorName(nameB);

  // Exact canonical match
  if (canonA === canonB) return 1.0;

  const parsedA = parseAuthorName(nameA);
  const parsedB = parseAuthorName(nameB);

  const normFamilyA = normalizeForComparison(parsedA.family);
  const normFamilyB = normalizeForComparison(parsedB.family);

  // Family names must match
  if (normFamilyA !== normFamilyB) return 0.0;

  const givenA = parsedA.given.map(normalizeForComparison).filter(Boolean);
  const givenB = parsedB.given.map(normalizeForComparison).filter(Boolean);

  // One side has no given names
  if (givenA.length === 0 || givenB.length === 0) return 0.7;

  // Check if all given names on one side are initials of the other
  const aInitialsOfB = givenA.every((g, i) =>
    i < givenB.length && (g === givenB[i] || isInitialOf(g, givenB[i]))
  );
  const bInitialsOfA = givenB.every((g, i) =>
    i < givenA.length && (g === givenA[i] || isInitialOf(g, givenA[i]))
  );

  if (aInitialsOfB || bInitialsOfA) return 0.85;

  // Partial given name overlap
  const overlap = givenA.filter((g) => givenB.includes(g));
  if (overlap.length > 0) return 0.6;

  // Family matches but given names are completely different
  return 0.3;
}

/**
 * Find potential author aliases in a list of author names.
 * Returns pairs of indices and their confidence scores.
 */
export function findAuthorAliases(
  authors: Array<{ id: string; name: string }>,
  threshold = 0.7
): Array<{ idA: string; idB: string; confidence: number }> {
  const results: Array<{ idA: string; idB: string; confidence: number }> = [];

  for (let i = 0; i < authors.length; i++) {
    for (let j = i + 1; j < authors.length; j++) {
      const confidence = compareAuthorNames(authors[i].name, authors[j].name);
      if (confidence >= threshold) {
        results.push({
          idA: authors[i].id,
          idB: authors[j].id,
          confidence
        });
      }
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
