import { updateInventoryQuantity, getInventoryItem } from '../ebay/inventory.js';
import { getDb } from '../db/client.js';
import { productMappings, syncLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { info, warn, error as logError } from '../utils/logger.js';
import { loadShopifyCredentials } from '../config/credentials.js';

export interface InventorySyncResult {
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ sku: string; error: string }>;
}

/**
 * Fetch inventory levels from Shopify for a list of inventory item IDs.
 */
const fetchShopifyInventoryLevels = async (
  accessToken: string,
  inventoryItemIds: string[],
): Promise<Map<string, number>> => {
  const creds = await loadShopifyCredentials();
  const levels = new Map<string, number>();

  // Shopify allows up to 50 IDs per request
  const chunks: string[][] = [];
  for (let i = 0; i < inventoryItemIds.length; i += 50) {
    chunks.push(inventoryItemIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    const ids = chunk.join(',');
    const url = `https://${creds.storeDomain}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${ids}`;

    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    if (!response.ok) continue;

    const data = (await response.json()) as {
      inventory_levels: Array<{
        inventory_item_id: number;
        available: number | null;
      }>;
    };

    for (const level of data.inventory_levels) {
      const current = levels.get(String(level.inventory_item_id)) ?? 0;
      levels.set(
        String(level.inventory_item_id),
        current + (level.available ?? 0),
      );
    }
  }

  return levels;
};

/**
 * Fetch Shopify products to get SKU → inventory item ID mapping.
 */
const fetchShopifyProductVariants = async (
  accessToken: string,
  productIds: string[],
): Promise<Map<string, { sku: string; inventoryItemId: string; quantity: number }>> => {
  const creds = await loadShopifyCredentials();
  const variants = new Map<string, { sku: string; inventoryItemId: string; quantity: number }>();

  for (const productId of productIds) {
    const numericId = productId.replace(/\D/g, '');
    const url = `https://${creds.storeDomain}/admin/api/2024-01/products/${numericId}.json?fields=id,variants`;

    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });

    if (!response.ok) continue;

    const data = (await response.json()) as {
      product: {
        id: number;
        variants: Array<{
          id: number;
          sku: string;
          inventory_item_id: number;
          inventory_quantity: number;
        }>;
      };
    };

    for (const v of data.product.variants) {
      if (v.sku) {
        variants.set(v.sku, {
          sku: v.sku,
          inventoryItemId: String(v.inventory_item_id),
          quantity: v.inventory_quantity,
        });
      }
    }
  }

  return variants;
};

/**
 * Sync inventory from Shopify to eBay.
 * For each product mapping, check Shopify quantity and update eBay if different.
 */
export const syncInventory = async (
  ebayAccessToken: string,
  shopifyAccessToken: string,
  options: { dryRun?: boolean } = {},
): Promise<InventorySyncResult> => {
  const result: InventorySyncResult = {
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const db = await getDb();

  // Get all product mappings
  const mappings = await db
    .select()
    .from(productMappings)
    .where(eq(productMappings.status, 'active'))
    .all();

  if (!mappings.length) {
    info('No product mappings found. Run product sync first.');
    return result;
  }

  info(`Checking inventory for ${mappings.length} mapped products...`);

  // Get Shopify product data
  const productIds = mappings.map((m) => m.shopifyProductId);
  const shopifyVariants = await fetchShopifyProductVariants(
    shopifyAccessToken,
    productIds,
  );

  for (const mapping of mappings) {
    const sku = mapping.ebayInventoryItemId;
    if (!sku) {
      result.skipped++;
      continue;
    }

    try {
      // Get Shopify quantity
      const shopifyVariant = shopifyVariants.get(sku);
      if (!shopifyVariant) {
        warn(`SKU ${sku} not found in Shopify`);
        result.skipped++;
        continue;
      }

      const shopifyQty = shopifyVariant.quantity;

      // Get eBay quantity
      const ebayItem = await getInventoryItem(ebayAccessToken, sku);
      if (!ebayItem) {
        warn(`SKU ${sku} not found on eBay`);
        result.skipped++;
        continue;
      }

      const ebayQty =
        ebayItem.availability?.shipToLocationAvailability?.quantity ?? 0;

      // Compare and update if different
      if (shopifyQty === ebayQty) {
        result.skipped++;
        continue;
      }

      if (options.dryRun) {
        info(
          `[DRY RUN] Would update ${sku}: eBay ${ebayQty} → ${shopifyQty}`,
        );
        result.updated++;
        continue;
      }

      await updateInventoryQuantity(ebayAccessToken, sku, shopifyQty);

      // Log
      await db
        .insert(syncLog)
        .values({
          direction: 'shopify_to_ebay',
          entityType: 'inventory',
          entityId: sku,
          status: 'success',
          detail: `Updated quantity ${ebayQty} → ${shopifyQty}`,
          createdAt: new Date(),
        })
        .run();

      info(`Updated: ${sku} quantity ${ebayQty} → ${shopifyQty}`);
      result.updated++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Failed to sync inventory for ${sku}: ${msg}`);
      result.failed++;
      result.errors.push({ sku: sku || 'unknown', error: msg });
    }
  }

  return result;
};
