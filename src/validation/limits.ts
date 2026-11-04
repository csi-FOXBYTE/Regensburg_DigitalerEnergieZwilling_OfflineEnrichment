/**
 * Upper bounds applied to every input file before deep processing.
 *
 * Input tiles come from an untrusted upload. Without bounds, a single crafted
 * file can exhaust the heap (huge vertex or object arrays), overflow the
 * stack (deeply nested arrays) or make the pairwise wall-overlap computation
 * run for hours (walls with thousands of vertices). A file that exceeds any
 * limit is skipped with a clear reason, which fails the run in strict mode.
 *
 * @group Validation
 */
export interface ProcessingLimits {
  /** Maximum size of one input file in bytes; checked before the file is read. */
  maxFileBytes: number;
  /** Maximum JSON nesting depth; checked on the raw text before parsing. */
  maxNestingDepth: number;
  /** Maximum number of entries in `CityObjects`. */
  maxCityObjects: number;
  /** Maximum number of entries in `vertices`. */
  maxVertices: number;
  /** Maximum number of vertex indices in one polygon ring. */
  maxRingVertices: number;
}

/**
 * Default limits. They leave at least five times headroom above the largest
 * Regensburg LoD2 tile measured (25 MB, 5,578 CityObjects, 132,947 vertices,
 * 395 vertices per ring, nesting depth 10).
 *
 * @group Validation
 */
export const DEFAULT_PROCESSING_LIMITS: Readonly<ProcessingLimits> = Object.freeze({
  maxFileBytes: 128 * 1024 * 1024,
  maxNestingDepth: 32,
  maxCityObjects: 100_000,
  maxVertices: 2_000_000,
  maxRingVertices: 2_000,
});

/**
 * Merges overrides into the defaults and rejects values that are not positive
 * safe integers, so a misconfiguration cannot silently disable a limit.
 *
 * @group Validation
 * @param overrides Limits to override; `undefined` entries keep the default.
 * @returns Complete, validated limits.
 */
export function resolveProcessingLimits(
  overrides: Partial<Record<keyof ProcessingLimits, number | undefined>> = {},
): ProcessingLimits {
  const limits = { ...DEFAULT_PROCESSING_LIMITS };
  for (const key of Object.keys(limits) as (keyof ProcessingLimits)[]) {
    const value = overrides[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`Invalid processing limit ${key}: ${String(value)} (expected a positive integer).`);
    }
    limits[key] = value;
  }
  return limits;
}

const OPEN_BRACE = 0x7b;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACE = 0x7d;
const CLOSE_BRACKET = 0x5d;
const QUOTE = 0x22;
const BACKSLASH = 0x5c;

/**
 * Checks whether the JSON text nests objects/arrays deeper than `maxDepth`.
 *
 * Runs in linear time without building any structure, so it can reject
 * deeply nested input before `JSON.parse` or any recursive traversal.
 *
 * @group Validation
 * @param raw JSON text.
 * @param maxDepth Maximum allowed nesting depth.
 * @returns `true`, if the nesting depth exceeds `maxDepth`.
 */
export function exceedsJsonNestingDepth(raw: string, maxDepth: number): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (inString) {
      if (code === BACKSLASH) {
        i += 1;
      } else if (code === QUOTE) {
        inString = false;
      }
      continue;
    }
    if (code === QUOTE) {
      inString = true;
    } else if (code === OPEN_BRACE || code === OPEN_BRACKET) {
      depth += 1;
      if (depth > maxDepth) return true;
    } else if (code === CLOSE_BRACE || code === CLOSE_BRACKET) {
      depth -= 1;
    }
  }
  return false;
}
