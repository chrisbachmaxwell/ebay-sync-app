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

// ── Tokenization (same as shopify-matcher) ─────────────────────────────

function tokenize(str: string): string[] {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s\-\.]/g, ' ')
    .split(/[\s\-]+/)
    .filter(t => t.length > 0);
}

function tokenOverlap(queryTokens: string[], targetTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const targetSet = new Set(targetTokens);
  let matches = 0;
  for (const token of queryTokens) {
    if (targetSet.has(token)) { matches++; continue; }
    for (const target of targetTokens) {
      if (target.includes(token) || token.includes(target)) { matches += 0.5; break; }
    }
  }
  return matches / queryTokens.length;
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

  const queryTokens = tokenize(productName);
  const queryLower = productName.toLowerCase();

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
        const folderTokens = tokenize(parsed.productName);
        let score = 0;

        // Exact substring match
        if (parsed.productName.toLowerCase().includes(queryLower) ||
            queryLower.includes(parsed.productName.toLowerCase())) {
          score = 1.0;
        } else {
          // Token overlap
          const overlap = tokenOverlap(queryTokens, folderTokens);
          if (overlap >= 0.7) {
            score = overlap;
          }
        }

        // Serial suffix boost
        if (score > 0 && serialSuffix && parsed.serialSuffix === serialSuffix) {
          score += 0.5;
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
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
