import { updateInventoryQuantity, getInventoryItem } from '../ebay/inventory.js';
import { getDb } from '../db/client.js';
import { productMappings, syncLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { info, warn, error as logError } from '../utils/logger.js';

export interface InventorySyncResult {
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ sku: string; error: string }>;
}

/**
 * Update eBay inventory quantity for a specific SKU.
 */
export const updateEbayInventory = async (
  ebayToken: string,
  sku: string,
  quantity: number,
  options: { dryRun?: boolean } = {},
): Promise<{ success: boolean; error?: string }> => {
  
  try {
    // Check if inventory item exists on eBay
    const existing = await getInventoryItem(ebayToken, sku);
    if (!existing) {
      return { success: false, error: 'Inventory item not found on eBay' };
    }
    
    const currentQuantity = existing.availability.shipToLocationAvailability.quantity;
    
    if (currentQuantity === quantity) {
      return { success: false, error: `Quantity unchanged (${quantity})` };
    }
    
    if (options.dryRun) {
      info(`[DRY RUN] Would update ${sku}: ${currentQuantity} → ${quantity}`);
      return { success: true };
    }
    
    await updateInventoryQuantity(ebayToken, sku, quantity);
    info(`Updated eBay inventory: ${sku} → ${quantity} units`);
    
    // Log sync
    const db = await getDb();
    await db
      .insert(syncLog)
      .values({
        direction: 'shopify_to_ebay',
        entityType: 'inventory',
        entityId: sku,
        status: 'success',
        detail: `Updated quantity: ${currentQuantity} → ${quantity}`,
        createdAt: new Date(),
      })
      .run();
    
    return { success: true };
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError(`Failed to update eBay inventory for ${sku}: ${errorMsg}`);
    
    // Log failure
    const db = await getDb();
    await db
      .insert(syncLog)
      .values({
        direction: 'shopify_to_ebay',
        entityType: 'inventory',
        entityId: sku,
        status: 'failed',
        detail: errorMsg,
        createdAt: new Date(),
      })
      .run();
    
    return { success: false, error: errorMsg };
  }
};

/**
 * Sync inventory levels for all mapped products.
 */
export const syncAllInventory = async (
  ebayToken: string,
  shopifyToken: string,
  options: { dryRun?: boolean } = {},
): Promise<InventorySyncResult> => {
  
  const result: InventorySyncResult = {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  const db = await getDb();
  
  // Get all active product mappings
  const mappings = await db
    .select()
    .from(productMappings)
    .where(eq(productMappings.status, 'active'))
    .all();
  
  info(`Starting inventory sync for ${mappings.length} mapped products...`);
  
  for (const mapping of mappings) {
    result.processed++;
    
    try {
      // Get current Shopify inventory level
      const shopifyResponse = await fetch(
        `https://usedcameragear.myshopify.com/admin/api/2024-01/products/${mapping.shopifyProductId}.json`,
        {
          headers: { 'X-Shopify-Access-Token': shopifyToken },
        }
      );
      
      if (!shopifyResponse.ok) {
        result.failed++;
        result.errors.push({ 
          sku: mapping.ebayInventoryItemId || 'unknown', 
          error: `Failed to fetch Shopify product: ${shopifyResponse.status}` 
        });
        continue;
      }
      
      const shopifyData = (await shopifyResponse.json()) as {
        product: {
          variants: Array<{
            sku: string;
            inventory_quantity: number;
          }>;
        };
      };
      
      // Find variant with matching SKU
      const variant = shopifyData.product.variants.find(
        v => v.sku === mapping.ebayInventoryItemId
      );
      
      if (!variant) {
        result.failed++;
        result.errors.push({ 
          sku: mapping.ebayInventoryItemId || 'unknown', 
          error: 'Matching variant not found' 
        });
        continue;
      }
      
      const shopifyQuantity = Math.max(0, variant.inventory_quantity || 0);
      
      // Update eBay inventory
      const updateResult = await updateEbayInventory(
        ebayToken,
        mapping.ebayInventoryItemId!,
        shopifyQuantity,
        options
      );
      
      if (updateResult.success) {
        result.updated++;
      } else {
        if (updateResult.error?.includes('unchanged')) {
          result.skipped++;
        } else {
          result.failed++;
          result.errors.push({ 
            sku: mapping.ebayInventoryItemId || 'unknown', 
            error: updateResult.error || 'Unknown error' 
          });
        }
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (err) {
      result.failed++;
      result.errors.push({ 
        sku: mapping.ebayInventoryItemId || 'unknown', 
        error: err instanceof Error ? err.message : String(err) 
      });
    }
  }
  
  info(`Inventory sync complete: ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`);
  return result;
};

/**
 * Handle Shopify inventory webhook update.
 * Called when a product variant's inventory changes in Shopify.
 */
export const handleInventoryWebhook = async (
  ebayToken: string,
  productId: string,
  variantId: string,
  newQuantity: number,
): Promise<void> => {
  
  try {
    const db = await getDb();
    
    // Find mapping by product ID
    const mapping = await db
      .select()
      .from(productMappings)
      .where(eq(productMappings.shopifyProductId, productId))
      .get();
    
    if (!mapping) {
      info(`[Webhook] No mapping found for product ${productId}`);
      return;
    }
    
    // Update eBay inventory
    const result = await updateEbayInventory(
      ebayToken,
      mapping.ebayInventoryItemId!,
      Math.max(0, newQuantity)
    );
    
    if (result.success) {
      info(`[Webhook] Updated eBay inventory: ${mapping.ebayInventoryItemId} → ${newQuantity}`);
    } else {
      warn(`[Webhook] Failed to update eBay inventory: ${result.error}`);
    }
    
  } catch (err) {
    logError(`[Webhook] Inventory update error: ${err}`);
  }
};