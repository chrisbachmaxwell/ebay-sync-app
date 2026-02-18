/**
 * drive-search.ts — Search the StyleShoots drive for product photo folders.
 *
 * Scans all preset folders in the StyleShoots drive and matches folder names
 * to a given product name using the same parsing/tokenization logic as the
 * shopify-matcher but in reverse (product name → folder).
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseFolderName, isImageFile } from './folder-parser.js';
import { info, warn } from '../utils/logger.js';

const DEFAULT_DRIVE_PATH = '/Volumes/StyleShootsDrive/UsedCameraGear/';

// ── Types ──────────────────────────────────────────────────────────────

export interface DriveSearchResult {
  folderPath: string;
  presetName: string;
  folderName: string;
  imagePaths: string[];
}

// ── Tokenization & Matching ────────────────────────────────────────────

/** Extract a serial number (digits following #) from a string, or null. */
function extractSerial(str: string): string | null {
  const m = str.match(/#\s*(\d+)/);
  return m ? m[1] : null;
}

function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\.]/g, ' ')
    .split(/[\s\-]+/)
    .filter(t => t.length > 0);
}

/** What fraction of `from` tokens appear (exactly or as substring) in `in_` tokens. */
function tokenOverlapDir(from: string[], in_: string[]): number {
  if (from.length === 0) return 0;
  let matches = 0;
  for (const token of from) {
    if (in_.includes(token)) { matches++; continue; }
    for (const target of in_) {
      if (target.includes(token) || token.includes(target)) { matches += 0.5; break; }
    }
  }
  return matches / from.length;
}

/**
 * Score how well a folder matches a Shopify product name.
 *
 * Strategy:
 * 1. If both have a serial number (#NNN) and they match → high confidence.
 *    Check that remaining folder tokens exist in Shopify title. Score 0.95+ if they do.
 * 2. If no serial → bidirectional token overlap, take the higher direction.
 */
function matchScore(shopifyName: string, folderName: string, folderSerial: string | null): number {
  const shopifySerial = extractSerial(shopifyName);
  const shopifyTokens = tokenize(shopifyName);
  const folderTokens = tokenize(folderName);

  // Serial-based matching
  if (shopifySerial && folderSerial && shopifySerial === folderSerial) {
    // Serial matches — verify folder tokens appear in shopify title
    // Remove the serial digits from folder tokens for this check
    const folderNonSerial = folderTokens.filter(t => t !== folderSerial);
    if (folderNonSerial.length === 0) return 0.95; // only had serial
    const overlap = tokenOverlapDir(folderNonSerial, shopifyTokens);
    // Even partial overlap with serial match is strong
    return 0.90 + (overlap * 0.10); // range: 0.90–1.0
  }

  // Serial mismatch (both have serials but different) → not a match
  if (shopifySerial && folderSerial && shopifySerial !== folderSerial) {
    return 0;
  }

  // No serial — bidirectional token overlap, take the higher score
  const folder2shopify = tokenOverlapDir(folderTokens, shopifyTokens);
  const shopify2folder = tokenOverlapDir(shopifyTokens, folderTokens);
  return Math.max(folder2shopify, shopify2folder);
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Check if the StyleShoots drive is mounted and accessible.
 */
export function isDriveMounted(drivePath?: string): boolean {
  try {
    fs.accessSync(drivePath ?? DEFAULT_DRIVE_PATH, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Search the StyleShoots drive for a folder matching the given product name.
 *
 * Returns the best match with its image paths, or null if no match found.
 */
export async function searchDriveForProduct(
  productName: string,
  serialSuffix?: string | null,
  drivePath?: string,
): Promise<DriveSearchResult | null> {
  const basePath = drivePath ?? DEFAULT_DRIVE_PATH;

  if (!isDriveMounted(basePath)) {
    warn('[DriveSearch] StyleShoots drive is not mounted');
    return null;
  }

  let bestMatch: { result: DriveSearchResult; score: number } | null = null;

  try {
    const presets = fs.readdirSync(basePath, { withFileTypes: true });

    for (const preset of presets) {
      if (!preset.isDirectory() || preset.name.startsWith('.')) continue;

      const presetPath = path.join(basePath, preset.name);
      let productDirs: fs.Dirent[];

      try {
        productDirs = fs.readdirSync(presetPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const dir of productDirs) {
        if (!dir.isDirectory() || dir.name.startsWith('.')) continue;

        const parsed = parseFolderName(dir.name);
        const score = matchScore(productName, parsed.productName, parsed.serialSuffix);

        if (score >= 0.7 && (!bestMatch || score > bestMatch.score)) {
          const folderPath = path.join(presetPath, dir.name);
          const imagePaths = collectImages(folderPath);

          if (imagePaths.length > 0) {
            bestMatch = {
              result: {
                folderPath,
                presetName: preset.name,
                folderName: dir.name,
                imagePaths,
              },
              score,
            };
          }
        }
      }
    }
  } catch (err) {
    warn(`[DriveSearch] Error scanning drive: ${err}`);
    return null;
  }

  if (bestMatch) {
    info(`[DriveSearch] Found match for "${productName}": ${bestMatch.result.presetName}/${bestMatch.result.folderName} (${bestMatch.result.imagePaths.length} images, score: ${bestMatch.score.toFixed(2)})`);
  }

  return bestMatch?.result ?? null;
}

/**
 * Collect image files from a folder, sorted by name.
 */
function collectImages(folderPath: string): string[] {
  try {
    return fs.readdirSync(folderPath)
      .filter(isImageFile)
      .sort()
      .map(f => path.join(folderPath, f));
  } catch {
    return [];
  }
}
