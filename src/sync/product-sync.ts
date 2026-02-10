import {
  createOrReplaceInventoryItem,
  createOffer,
  publishOffer,
  getOffers,
  type EbayOffer,
} from '../ebay/inventory.js';
import { getDb } from '../db/client.js';
import { productMappings, syncLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { info, warn, error as logError } from '../utils/logger.js';
import { loadShopifyCredentials } from '../config/credentials.js';

export interface ShopifyProduct {
  id: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  images: Array<{ src: string }>;
  variants: Array<{
    id: string;
    sku: string;
    price: string;
    inventoryQuantity: number;
    weight?: number;
    weightUnit?: string;
  }>;
}

export interface ProductSyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ sku: string; error: string }>;
}

/**
 * Map a Shopify product to eBay inventory item format.
 */
const mapShopifyToEbayItem = (product: ShopifyProduct, variant: ShopifyProduct['variants'][0]) => {
  // Strip HTML from description
  const description = product.bodyHtml
    ? product.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    : product.title;

  return {
    product: {
      title: product.title.slice(0, 80), // eBay title max 80 chars
      description,
      imageUrls: product.images.map((img) => img.src).slice(0, 12), // eBay max 12 images
      aspects: {
        Brand: [product.vendor || 'Unbranded'],
        Type: [product.productType || 'Camera Equipment'],
      },
    },
    condition: 'USED_GOOD' as string, // Default for used camera gear
    conditionDescription: 'Pre-owned, tested and working. See description for details.',
    availability: {
      shipToLocationAvailability: {
        quantity: Math.max(0, variant.inventoryQuantity),
      },
    },
  };
};

/**
 * Sync products from Shopify to eBay.
 * Creates inventory items and offers for products that don't exist on eBay yet.
 */
export const syncProducts = async (
  ebayAccessToken: string,
  shopifyAccessToken: string,
  products: ShopifyProduct[],
  options: {
    dryRun?: boolean;
    categoryId?: string; // Default eBay category
    fulfillmentPolicyId?: string;
    paymentPolicyId?: string;
    returnPolicyId?: string;
  } = {},
): Promise<ProductSyncResult> => {
  const result: ProductSyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const db = await getDb();

  for (const product of products) {
    for (const variant of product.variants) {
      const sku = variant.sku;
      if (!sku) {
        warn(`Skipping product "${product.title}" — no SKU`);
        result.skipped++;
        continue;
      }

      try {
        // Check if already synced
        const existing = await db
          .select()
          .from(productMappings)
          .where(eq(productMappings.shopifyProductId, String(product.id)))
          .get();

        if (existing) {
          result.skipped++;
          continue;
        }

        if (options.dryRun) {
          info(`[DRY RUN] Would create: ${sku} — ${product.title} ($${variant.price})`);
          result.created++;
          continue;
        }

        // Create inventory item
        const ebayItem = mapShopifyToEbayItem(product, variant);
        await createOrReplaceInventoryItem(ebayAccessToken, sku, ebayItem);

        // Check for existing offer
        let offerId: string | undefined;
        try {
          const offers = await getOffers(ebayAccessToken, sku);
          if (offers.offers?.length > 0) {
            offerId = offers.offers[0].offerId;
          }
        } catch {
          // No existing offers
        }

        // Create offer if none exists
        if (!offerId && options.categoryId) {
          const offer: Omit<EbayOffer, 'offerId'> = {
            sku,
            marketplaceId: 'EBAY_US',
            format: 'FIXED_PRICE',
            availableQuantity: Math.max(0, variant.inventoryQuantity),
            pricingSummary: {
              price: { value: variant.price, currency: 'USD' },
            },
            listingPolicies: {
              fulfillmentPolicyId: options.fulfillmentPolicyId || '',
              paymentPolicyId: options.paymentPolicyId || '',
              returnPolicyId: options.returnPolicyId || '',
            },
            categoryId: options.categoryId,
          };

          const offerResult = await createOffer(ebayAccessToken, offer);
          offerId = offerResult.offerId;

          // Publish the offer to make it live
          if (offerId) {
            const published = await publishOffer(ebayAccessToken, offerId);
            info(`Published: ${sku} → eBay listing ${published.listingId}`);

            // Save mapping
            await db
              .insert(productMappings)
              .values({
                shopifyProductId: String(product.id),
                ebayListingId: published.listingId,
                ebayInventoryItemId: sku,
                status: 'active',
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .run();
          }
        } else if (!options.categoryId) {
          // Save mapping without listing (inventory item only)
          await db
            .insert(productMappings)
            .values({
              shopifyProductId: String(product.id),
              ebayListingId: offerId || 'pending',
              ebayInventoryItemId: sku,
              status: offerId ? 'active' : 'inventory_only',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();
        }

        // Log sync
        await db
          .insert(syncLog)
          .values({
            direction: 'shopify_to_ebay',
            entityType: 'product',
            entityId: sku,
            status: 'success',
            detail: `Created eBay inventory item for ${product.title}`,
            createdAt: new Date(),
          })
          .run();

        info(`Synced: ${sku} — ${product.title}`);
        result.created++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to sync ${sku}: ${msg}`);
        result.failed++;
        result.errors.push({ sku, error: msg });
      }
    }
  }

  return result;
};
