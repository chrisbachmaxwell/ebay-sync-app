import { loadShopifyCredentials } from '../config/credentials.js';

export interface ShopifyOrderInput {
  source_name: string;
  source_identifier: string;
  note: string;
  tags: string;
  financial_status: 'paid' | 'pending';
  fulfillment_status: null | 'fulfilled';
  line_items: Array<{
    title: string;
    sku?: string;
    quantity: number;
    price: string;
    requires_shipping: boolean;
  }>;
  shipping_address: {
    first_name: string;
    last_name: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    zip: string;
    country_code: string;
    phone?: string;
  };
  billing_address?: ShopifyOrderInput['shipping_address'];
  shipping_lines: Array<{
    title: string;
    price: string;
    code: string;
  }>;
  tax_lines?: Array<{
    title: string;
    price: string;
    rate: number;
  }>;
  send_receipt: false;
  send_fulfillment_receipt: false;
  suppress_notifications: true;
}

export interface ShopifyOrderResult {
  id: number;
  name: string;
  order_number: number;
}

/**
 * Create an order in Shopify via REST Admin API.
 */
export const createShopifyOrder = async (
  accessToken: string,
  order: ShopifyOrderInput,
): Promise<ShopifyOrderResult> => {
  const creds = await loadShopifyCredentials();
  const url = `https://${creds.storeDomain}/admin/api/2024-01/orders.json`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify order creation failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    order: ShopifyOrderResult;
  };
  return data.order;
};

/**
 * Check if an eBay order was already imported into Shopify.
 * Searches by tag (eBay-{orderId}).
 */
export const findExistingShopifyOrder = async (
  accessToken: string,
  ebayOrderId: string,
): Promise<{ id: number; name: string } | null> => {
  const creds = await loadShopifyCredentials();
  const tag = `eBay-${ebayOrderId}`;
  const url = `https://${creds.storeDomain}/admin/api/2024-01/orders.json?status=any&tag=${encodeURIComponent(tag)}&limit=1`;

  const response = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    orders: Array<{ id: number; name: string }>;
  };
  return data.orders[0] ?? null;
};

/**
 * Fetch recent Shopify orders (for listing/status).
 */
export const fetchShopifyOrders = async (
  accessToken: string,
  options: { limit?: number; status?: string; sinceId?: string } = {},
): Promise<Array<{ id: number; name: string; created_at: string; total_price: string; tags: string }>> => {
  const creds = await loadShopifyCredentials();
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 50));
  if (options.status) params.set('status', options.status);
  if (options.sinceId) params.set('since_id', options.sinceId);

  const url = `https://${creds.storeDomain}/admin/api/2024-01/orders.json?${params.toString()}`;

  const response = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify orders fetch failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    orders: Array<{ id: number; name: string; created_at: string; total_price: string; tags: string }>;
  };
  return data.orders;
};
