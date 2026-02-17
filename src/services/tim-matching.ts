/**
 * TIM SKU Matching Service
 * Matches Shopify product SKUs to TIM items
 */
import { fetchTimItems, type TimItem } from './tim-service.js';

export interface TimConditionData {
  timItemId: number;
  condition: string | null;
  conditionNotes: string | null;
  graderNotes: string | null;
  serialNumber: string | null;
  brand: string | null;
  productName: string;
  sku: string;
  itemStatus: string;
}

/**
 * Find a TIM item matching a Shopify SKU.
 * Shopify used product SKUs follow pattern: {baseSKU}-U{serialSuffix}
 * TIM items have the same SKU format.
 */
export async function findTimItemBySku(shopifySku: string): Promise<TimConditionData | null> {
  if (!shopifySku) return null;

  const items = await fetchTimItems();

  // Direct SKU match (case-insensitive)
  const normalizedSku = shopifySku.trim().toUpperCase();
  const match = items.find(item =>
    item.sku && item.sku.trim().toUpperCase() === normalizedSku
  );

  if (!match) return null;

  return mapToConditionData(match);
}

/**
 * Find TIM item for a Shopify product by looking up its variant SKUs.
 * Takes an array of variant SKUs from the Shopify product.
 */
export async function findTimItemForProduct(variantSkus: string[]): Promise<TimConditionData | null> {
  for (const sku of variantSkus) {
    const result = await findTimItemBySku(sku);
    if (result) return result;
  }
  return null;
}

function mapToConditionData(item: TimItem): TimConditionData {
  return {
    timItemId: item.id,
    condition: item.condition,
    conditionNotes: item.conditionNotes,
    graderNotes: item.graderNotes,
    serialNumber: item.serialNumber,
    brand: item.brand,
    productName: item.productName,
    sku: item.sku!,
    itemStatus: item.itemStatus,
  };
}

/**
 * Format TIM condition data for AI description prompt injection.
 */
export function formatConditionForPrompt(data: TimConditionData): string {
  const parts: string[] = [];

  if (data.condition) {
    // Convert snake_case to readable: excellent_plus → Excellent Plus
    const readable = data.condition.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    parts.push(`TIM Condition Grade: ${readable}`);
  }

  if (data.conditionNotes) {
    parts.push(`Condition Notes: ${data.conditionNotes}`);
  }

  if (data.graderNotes) {
    parts.push(`Grader Notes: ${data.graderNotes}`);
  }

  if (data.serialNumber) {
    parts.push(`Serial Number: ${data.serialNumber}`);
  }

  return parts.join('. ');
}
