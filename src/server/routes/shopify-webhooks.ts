import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { getRawDb } from '../../db/client.js';
import { info, warn, error as logError } from '../../utils/logger.js';
import { loadShopifyCredentials } from '../../config/credentials.js';

const router = Router();

async function verifyShopifyWebhook(req: Request): Promise<boolean> {
  try {
    const creds = await loadShopifyCredentials();
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    if (!hmacHeader) return false;

    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      warn('[Shopify Webhook] No raw body for HMAC verification');
      return false; // Fail verification if no body
    }

    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const hash = crypto
      .createHmac('sha256', creds.clientSecret)
      .update(bodyStr, 'utf8')
      .digest('base64');

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

router.post('/webhooks/shopify/:topic', async (req: Request, res: Response) => {
  const rawTopic = req.params.topic || req.get('X-Shopify-Topic') || 'unknown';
  const topic = Array.isArray(rawTopic) ? rawTopic[0] : rawTopic;

  res.status(200).send('OK');

  const isValid = await verifyShopifyWebhook(req);
  if (!isValid) {
    warn(`[Shopify Webhook] HMAC verification failed: ${topic}`);
    return; // Stop processing if signature is invalid
  }

  const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  info(`[Shopify Webhook] Received: ${topic}`);

  try {
    const db = await getRawDb();
    db.prepare(
      `INSERT INTO notification_log (source, topic, payload, status, createdAt) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('shopify', topic, payload.substring(0, 10000), 'received');
  } catch (err) {
    logError(`[Shopify Webhook] Log error: ${err}`);
  }

  try {
    await handleShopifyWebhook(topic, req.body);
  } catch (err) {
    logError(`[Shopify Webhook] Handler error for ${topic}: ${err}`);
  }
});

async function handleShopifyWebhook(topic: string, body: any): Promise<void> {
  try {
    switch (topic) {
      case 'products/update':
      case 'products-update':
        await handleProductUpdate(body);
        break;
      case 'products/create':
      case 'products-create':
        await handleProductCreate(body);
        break;
      case 'products/delete':
      case 'products-delete':
        await handleProductDelete(body);
        break;
      case 'orders/fulfilled':
      case 'orders-fulfilled':
        await handleOrderFulfilled(body);
        break;
      case 'inventory_levels/update':
      case 'inventory_levels-update':
        await handleInventoryUpdate(body);
        break;
      default:
        warn(`[Shopify Webhook] Unhandled: ${topic}`);
    }
  } catch (err) {
    logError(`[Shopify Webhook] Handler error for ${topic}: ${err}`);
  }
}

async function handleProductUpdate(body: any): Promise<void> {
  info(`[Shopify Webhook] Product updated: ${body?.title} (${body?.id})`);
  
  // TODO: Update eBay listing price/details if price sync is enabled
  const db = await getRawDb();
  const settings = db.prepare(`SELECT value FROM settings WHERE key = 'sync_price'`).get() as any;
  
  if (settings?.value === 'true') {
    info(`[Webhook] Price sync enabled - would update eBay price for product ${body?.id}`);
    // Implementation would go here
  }
}

async function handleProductCreate(body: any): Promise<void> {
  info(`[Shopify Webhook] New product: ${body?.title} (${body?.id})`);
  
  // TODO: Auto-list to eBay if auto_list is enabled
  const db = await getRawDb();
  const settings = db.prepare(`SELECT value FROM settings WHERE key = 'auto_list'`).get() as any;
  
  if (settings?.value === 'true') {
    info(`[Webhook] Auto-list enabled - would create eBay listing for product ${body?.id}`);
    // Implementation would go here - call product sync
  }
}

async function handleProductDelete(body: any): Promise<void> {
  info(`[Shopify Webhook] Product deleted: ${body?.id}`);
  
  // TODO: End eBay listing if it exists
  const db = await getRawDb();
  const mapping = db.prepare(`SELECT * FROM product_mappings WHERE shopify_product_id = ?`).get(String(body?.id)) as any;
  
  if (mapping) {
    info(`[Webhook] Product was mapped to eBay listing ${mapping.ebay_listing_id} - would end listing`);
    // Implementation would go here - end eBay listing
  }
}

async function handleOrderFulfilled(body: any): Promise<void> {
  const shopifyOrderId = String(body?.id);
  const shopifyOrderName = body?.name;
  
  info(`[Shopify Webhook] Order fulfilled: ${shopifyOrderName} (${shopifyOrderId})`);
  
  try {
    // Find the corresponding eBay order
    const db = await getRawDb();
    const mapping = db.prepare(
      `SELECT * FROM order_mappings WHERE shopify_order_id = ?`
    ).get(shopifyOrderId) as any;
    
    if (!mapping) {
      info(`[Webhook] No eBay mapping found for Shopify order ${shopifyOrderName}`);
      return;
    }
    
    const ebayOrderId = mapping.ebay_order_id;
    
    // Get eBay token
    const ebayTokenRow = db.prepare(`SELECT access_token FROM auth_tokens WHERE platform = 'ebay'`).get() as any;
    if (!ebayTokenRow?.access_token) {
      warn(`[Webhook] No eBay token found for fulfillment sync`);
      return;
    }
    
    // Extract tracking info from fulfillments
    const fulfillments = body?.fulfillments || [];
    if (fulfillments.length === 0) {
      warn(`[Webhook] No fulfillments found in order ${shopifyOrderName}`);
      return;
    }
    
    const fulfillment = fulfillments[0];  // Use first fulfillment
    const trackingNumber = fulfillment?.tracking_number;
    const carrier = fulfillment?.tracking_company;
    
    if (!trackingNumber) {
      warn(`[Webhook] No tracking number found for order ${shopifyOrderName}`);
      return;
    }
    
    // Create eBay shipping fulfillment
    info(`[Webhook] Creating eBay fulfillment: ${ebayOrderId} → tracking ${trackingNumber}`);
    
    const { createShippingFulfillment } = await import('../../ebay/fulfillment.js');
    const { mapShippingCarrier } = await import('../../sync/mapper.js');
    
    // Get all line items for the order (eBay requires this)
    const ebayOrder = await import('../../ebay/fulfillment.js').then(mod => 
      mod.fetchEbayOrder(ebayTokenRow.access_token, ebayOrderId)
    );
    
    const fulfillmentData = {
      lineItems: ebayOrder.lineItems.map(item => ({
        lineItemId: item.lineItemId,
        quantity: item.quantity,
      })),
      shippedDate: new Date().toISOString(),
      shippingCarrierCode: mapShippingCarrier(carrier || 'OTHER'),
      trackingNumber,
    };
    
    const fulfillmentResult = await createShippingFulfillment(
      ebayTokenRow.access_token,
      ebayOrderId,
      fulfillmentData
    );
    
    info(`[Webhook] eBay fulfillment created: ${fulfillmentResult.fulfillmentId} for order ${ebayOrderId}`);
    
    // Update local mapping status
    db.prepare(
      `UPDATE order_mappings SET status = 'fulfilled' WHERE ebay_order_id = ?`
    ).run(ebayOrderId);
    
  } catch (err) {
    logError(`[Webhook] Fulfillment sync error for ${shopifyOrderName}: ${err}`);
  }
}

async function handleInventoryUpdate(body: any): Promise<void> {
  const inventoryItemId = body?.inventory_item_id;
  const available = body?.available;
  
  info(`[Shopify Webhook] Inventory updated: item ${inventoryItemId}, available: ${available}`);
  
  // TODO: Update eBay inventory if sync_inventory is enabled
  const db = await getRawDb();
  const settings = db.prepare(`SELECT value FROM settings WHERE key = 'sync_inventory'`).get() as any;
  
  if (settings?.value === 'true') {
    info(`[Webhook] Inventory sync enabled - would update eBay inventory for item ${inventoryItemId}`);
    
    // Get eBay token
    const ebayTokenRow = db.prepare(`SELECT access_token FROM auth_tokens WHERE platform = 'ebay'`).get() as any;
    if (!ebayTokenRow?.access_token) {
      return;
    }
    
    try {
      const { handleInventoryWebhook } = await import('../../sync/inventory-sync.js');
      
      // We need to find the product ID from the inventory item ID
      // This requires a Shopify API call to get the variant info
      // For now, just log that we would handle it
      info(`[Webhook] Would sync inventory via handleInventoryWebhook`);
      
    } catch (err) {
      logError(`[Webhook] Inventory sync error: ${err}`);
    }
  }
}

export default router;
