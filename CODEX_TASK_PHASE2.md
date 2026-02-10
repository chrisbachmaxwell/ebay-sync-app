# Codex Task: Phase 2 — eBay Order Sync + Auth Flow

## Context
This is an eBay ↔ Shopify sync CLI tool at ~/projects/ebay-sync-app/. Phase 1 is done:
- Shopify auth (client_credentials) works
- Shopify product listing works  
- SQLite DB with auto-init tables works
- CLI structure with commander works

eBay seller account: "usedcam-0" on eBay.com
Shopify store: usedcameragear.myshopify.com

## Task 1: Fix eBay Auth Flow

Current `src/ebay/auth.ts` uses localhost callback which won't work with eBay's production OAuth.

### Changes needed to `src/ebay/auth.ts`:
1. Support TWO auth modes:
   a. **With RuName** (if `ruName` is in credentials): Generate the consent URL, print it, then start local server to catch the redirect
   b. **Without RuName** (manual code paste): Generate the consent URL with `redirect_uri=urn:ietf:wg:oauth:2.0:oob` (eBay's out-of-band flow), print the URL, then prompt the user to paste the auth code from the browser
2. The consent URL format is:
   ```
   https://auth.ebay.com/oauth2/authorize?client_id={APP_ID}&response_type=code&redirect_uri={RU_NAME_OR_OOB}&scope={SCOPES}
   ```
3. For the OOB flow: after user visits URL and grants access, eBay shows the auth code on-screen. User pastes it into the CLI.

### Changes to `src/ebay/auth.ts`:
```typescript
// Add import for readline
import * as readline from 'node:readline/promises';

// Add function: generateConsentUrl(appId, redirectUri, scopes) -> string
// Modify startEbayAuthFlow to support both modes
// Add startEbayAuthFlowManual() for OOB code paste
```

### Changes to `src/cli/auth.ts`:
- Add `--manual` flag to `auth ebay` command for manual code paste mode
- Default to manual mode if no RuName configured
- Print the consent URL clearly with instructions

## Task 2: Implement eBay Order Fetching

Replace the stub in `src/ebay/fulfillment.ts` with real implementation.

### eBay Fulfillment API — getOrders:
- **Endpoint**: `GET https://api.ebay.com/sell/fulfillment/v1/order`
- **Auth**: Bearer token (user access token, scope: sell.fulfillment)
- **Query params**:
  - `filter`: creationdate, lastmodifieddate, orderfulfillmentstatus
  - `limit`: 1-200 (default 50)
  - `offset`: pagination
  - `fieldGroups`: TAX_BREAKDOWN (optional)
- **Date filter format**: `creationdate:[2024-01-01T00:00:00.000Z..]`

### Implementation for `src/ebay/fulfillment.ts`:
```typescript
import { ebayRequest } from './client.js';

export interface EbayOrderLineItem {
  lineItemId: string;
  legacyItemId: string;
  title: string;
  sku: string;
  quantity: number;
  lineItemCost: { value: string; currency: string };
  deliveryCost?: { shippingCost?: { value: string; currency: string } };
  lineItemFulfillmentStatus: string;
}

export interface EbayShippingAddress {
  fullName: string;
  contactAddress: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    stateOrProvince: string;
    postalCode: string;
    countryCode: string;
  };
  primaryPhone?: { phoneNumber: string };
  email?: string;
}

export interface EbayOrder {
  orderId: string;
  legacyOrderId: string;
  creationDate: string;
  lastModifiedDate: string;
  orderFulfillmentStatus: string;  // NOT_STARTED, IN_PROGRESS, FULFILLED
  orderPaymentStatus: string;      // PAID, PENDING, FAILED
  pricingSummary: {
    total: { value: string; currency: string };
    subtotal?: { value: string; currency: string };
    deliveryCost?: { value: string; currency: string };
    tax?: { value: string; currency: string };
  };
  buyer: {
    username: string;
    taxAddress?: { stateOrProvince: string; postalCode: string; countryCode: string };
  };
  fulfillmentStartInstructions: Array<{
    shippingStep: {
      shipTo: EbayShippingAddress;
      shippingCarrierCode?: string;
      shippingServiceCode?: string;
    };
  }>;
  lineItems: EbayOrderLineItem[];
  salesRecordReference?: string;
  cancelStatus?: { cancelState: string };
}

export interface EbayOrdersResponse {
  href: string;
  total: number;
  limit: number;
  offset: number;
  orders: EbayOrder[];
  next?: string;
  prev?: string;
}

export const fetchEbayOrders = async (
  accessToken: string,
  options: {
    createdAfter?: string;  // ISO date
    modifiedAfter?: string; // ISO date  
    fulfillmentStatus?: string; // NOT_STARTED|IN_PROGRESS|FULFILLED
    limit?: number;
    offset?: number;
  } = {}
): Promise<EbayOrdersResponse> => {
  const filters: string[] = [];
  
  if (options.createdAfter) {
    filters.push(`creationdate:[${options.createdAfter}..]`);
  }
  if (options.modifiedAfter) {
    filters.push(`lastmodifieddate:[${options.modifiedAfter}..]`);
  }
  if (options.fulfillmentStatus) {
    filters.push(`orderfulfillmentstatus:{${options.fulfillmentStatus}}`);
  }

  const params = new URLSearchParams();
  if (filters.length) params.set('filter', filters.join(','));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));

  const query = params.toString();
  const path = `/sell/fulfillment/v1/order${query ? '?' + query : ''}`;

  return ebayRequest<EbayOrdersResponse>({ path, accessToken });
};

// Fetch ALL orders with pagination
export const fetchAllEbayOrders = async (
  accessToken: string,
  options: { createdAfter?: string; modifiedAfter?: string } = {}
): Promise<EbayOrder[]> => {
  const allOrders: EbayOrder[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const response = await fetchEbayOrders(accessToken, { ...options, limit, offset });
    allOrders.push(...response.orders);
    
    if (allOrders.length >= response.total || !response.next) break;
    offset += limit;
  }

  return allOrders;
};
```

## Task 3: Implement Shopify Order Creation

Replace stub in `src/shopify/orders.ts` with real implementation using GraphQL.

### Shopify GraphQL — Create Order (Draft Order + Complete):
For importing eBay orders into Shopify, use the REST Admin API `POST /admin/api/2024-01/orders.json` with the order data. This is simpler than GraphQL for order creation.

### Implementation for `src/shopify/orders.ts`:
```typescript
import { loadShopifyCredentials } from '../config/credentials.js';

export interface ShopifyOrderInput {
  // External order reference
  source_name: string;  // "ebay"
  source_identifier: string;  // eBay order ID
  note: string;  // "eBay Order: {orderId}"
  tags: string;  // "eBay,usedcam-0"
  
  // Financial
  financial_status: 'paid' | 'pending';
  fulfillment_status: null | 'fulfilled';
  
  // Line items
  line_items: Array<{
    title: string;
    sku?: string;
    quantity: number;
    price: string;
    requires_shipping: boolean;
  }>;
  
  // Customer/shipping
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
  billing_address?: typeof this.shipping_address;
  
  // Shipping
  shipping_lines: Array<{
    title: string;
    price: string;
    code: string;
  }>;
  
  // Tax
  tax_lines?: Array<{
    title: string;
    price: string;
    rate: number;
  }>;
  
  // Prevent notifications
  send_receipt: false;
  send_fulfillment_receipt: false;
  suppress_notifications: true;
}

export const createShopifyOrder = async (
  accessToken: string,
  order: ShopifyOrderInput
): Promise<{ id: number; name: string; order_number: number }> => {
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

  const data = await response.json() as { order: { id: number; name: string; order_number: number } };
  return data.order;
};

// Check if an eBay order was already imported
export const findExistingShopifyOrder = async (
  accessToken: string,
  ebayOrderId: string
): Promise<{ id: number; name: string } | null> => {
  const creds = await loadShopifyCredentials();
  // Search by source_identifier or tag
  const url = `https://${creds.storeDomain}/admin/api/2024-01/orders.json?status=any&tag=eBay-${ebayOrderId}`;
  
  const response = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': accessToken },
  });

  if (!response.ok) return null;
  
  const data = await response.json() as { orders: Array<{ id: number; name: string }> };
  return data.orders[0] ?? null;
};
```

## Task 4: Implement Order Sync Logic

Replace stub in `src/sync/order-sync.ts`:

```typescript
import { fetchAllEbayOrders, type EbayOrder } from '../ebay/fulfillment.js';
import { createShopifyOrder, findExistingShopifyOrder } from '../shopify/orders.js';
import { getDb } from '../db/client.js';
import { orderMappings, syncLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { info, warn, error as logError } from '../utils/logger.js';

export interface SyncResult {
  imported: number;
  skipped: number;  // already exists
  failed: number;
  errors: Array<{ ebayOrderId: string; error: string }>;
}

const mapEbayOrderToShopify = (ebayOrder: EbayOrder) => {
  const shipTo = ebayOrder.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
  const nameParts = (shipTo?.fullName || 'eBay Buyer').split(' ');
  const firstName = nameParts[0] || 'eBay';
  const lastName = nameParts.slice(1).join(' ') || 'Buyer';
  const addr = shipTo?.contactAddress;

  return {
    source_name: 'ebay',
    source_identifier: ebayOrder.orderId,
    note: `eBay Order: ${ebayOrder.orderId} (Legacy: ${ebayOrder.legacyOrderId || 'N/A'})`,
    tags: `eBay,usedcam-0,eBay-${ebayOrder.orderId}`,
    financial_status: ebayOrder.orderPaymentStatus === 'PAID' ? 'paid' as const : 'pending' as const,
    fulfillment_status: null,
    line_items: ebayOrder.lineItems.map(li => ({
      title: li.title,
      sku: li.sku || undefined,
      quantity: li.quantity,
      price: li.lineItemCost.value,
      requires_shipping: true,
    })),
    shipping_address: {
      first_name: firstName,
      last_name: lastName,
      address1: addr?.addressLine1 || '',
      address2: addr?.addressLine2 || undefined,
      city: addr?.city || '',
      province: addr?.stateOrProvince || '',
      zip: addr?.postalCode || '',
      country_code: addr?.countryCode || 'US',
      phone: shipTo?.primaryPhone?.phoneNumber || undefined,
    },
    shipping_lines: [{
      title: 'eBay Shipping',
      price: ebayOrder.pricingSummary?.deliveryCost?.value || '0.00',
      code: 'ebay_shipping',
    }],
    send_receipt: false as const,
    send_fulfillment_receipt: false as const,
    suppress_notifications: true as const,
  };
};

export const syncOrders = async (
  ebayAccessToken: string,
  shopifyAccessToken: string,
  options: { createdAfter?: string; dryRun?: boolean } = {}
): Promise<SyncResult> => {
  const result: SyncResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const db = await getDb();

  // Fetch eBay orders
  info('Fetching eBay orders...');
  const ebayOrders = await fetchAllEbayOrders(ebayAccessToken, {
    createdAfter: options.createdAfter,
  });
  info(`Found ${ebayOrders.length} eBay orders`);

  for (const ebayOrder of ebayOrders) {
    try {
      // Check local DB first (fast dedup)
      const existing = await db
        .select()
        .from(orderMappings)
        .where(eq(orderMappings.ebayOrderId, ebayOrder.orderId))
        .get();

      if (existing) {
        result.skipped++;
        continue;
      }

      // Check Shopify (belt + suspenders dedup)
      const shopifyExisting = await findExistingShopifyOrder(shopifyAccessToken, ebayOrder.orderId);
      if (shopifyExisting) {
        // Save mapping for future fast lookups
        await db.insert(orderMappings).values({
          ebayOrderId: ebayOrder.orderId,
          shopifyOrderId: String(shopifyExisting.id),
          shopifyOrderName: shopifyExisting.name,
          status: 'synced',
          syncedAt: new Date(),
        }).run();
        result.skipped++;
        continue;
      }

      if (options.dryRun) {
        info(`[DRY RUN] Would import: ${ebayOrder.orderId} — ${ebayOrder.pricingSummary.total.value} ${ebayOrder.pricingSummary.total.currency}`);
        result.imported++;
        continue;
      }

      // Create in Shopify
      const shopifyInput = mapEbayOrderToShopify(ebayOrder);
      const shopifyOrder = await createShopifyOrder(shopifyAccessToken, shopifyInput);

      // Save mapping
      await db.insert(orderMappings).values({
        ebayOrderId: ebayOrder.orderId,
        shopifyOrderId: String(shopifyOrder.id),
        shopifyOrderName: shopifyOrder.name,
        status: 'synced',
        syncedAt: new Date(),
      }).run();

      // Log sync
      await db.insert(syncLog).values({
        direction: 'ebay_to_shopify',
        entityType: 'order',
        entityId: ebayOrder.orderId,
        status: 'success',
        detail: `Created Shopify order ${shopifyOrder.name}`,
        createdAt: new Date(),
      }).run();

      info(`Imported: ${ebayOrder.orderId} → Shopify ${shopifyOrder.name}`);
      result.imported++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logError(`Failed to import ${ebayOrder.orderId}: ${msg}`);
      result.failed++;
      result.errors.push({ ebayOrderId: ebayOrder.orderId, error: msg });
    }
  }

  return result;
};
```

## Task 5: Update CLI Orders Command

Update `src/cli/orders.ts` to wire up the real order sync:

```typescript
import { Command } from 'commander';
import ora from 'ora';
import { syncOrders } from '../sync/order-sync.js';
import { getDb } from '../db/client.js';
import { authTokens, orderMappings } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { info, error as logError } from '../utils/logger.js';

const getToken = async (platform: string) => {
  const db = await getDb();
  const row = await db.select().from(authTokens).where(eq(authTokens.platform, platform)).get();
  if (!row) throw new Error(`No ${platform} auth token. Run: ebaysync auth ${platform}`);
  return row.accessToken;
};

export const buildOrdersCommand = () => {
  const orders = new Command('orders').description('Order sync commands');

  orders
    .command('sync')
    .description('Sync eBay orders to Shopify')
    .option('--since <date>', 'Only sync orders created after this date (ISO format)')
    .option('--dry-run', 'Preview what would be synced without creating orders')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      const spinner = ora('Syncing eBay orders to Shopify').start();
      try {
        const ebayToken = await getToken('ebay');
        const shopifyToken = await getToken('shopify');
        
        const result = await syncOrders(ebayToken, shopifyToken, {
          createdAfter: opts.since,
          dryRun: opts.dryRun,
        });

        spinner.succeed(`Order sync complete: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed`);
        
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        }

        if (result.errors.length) {
          logError('Errors:');
          result.errors.forEach(e => logError(`  ${e.ebayOrderId}: ${e.error}`));
        }
      } catch (err) {
        spinner.fail(err instanceof Error ? err.message : 'Order sync failed');
        process.exitCode = 1;
      }
    });

  orders
    .command('list')
    .description('List synced order mappings')
    .option('--limit <n>', 'Number of recent mappings', '20')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const db = await getDb();
        const mappings = await db
          .select()
          .from(orderMappings)
          .orderBy(desc(orderMappings.syncedAt))
          .limit(parseInt(opts.limit))
          .all();

        if (opts.json) {
          console.log(JSON.stringify(mappings, null, 2));
        } else {
          if (!mappings.length) {
            info('No synced orders yet.');
            return;
          }
          info(`Recent synced orders (${mappings.length}):`);
          mappings.forEach(m => {
            info(`  ${m.ebayOrderId} → ${m.shopifyOrderName} (${m.status})`);
          });
        }
      } catch (err) {
        logError(err instanceof Error ? err.message : 'Failed to list orders');
        process.exitCode = 1;
      }
    });

  return orders;
};
```

## Task 6: Update DB Schema

The `order_mappings` table in `src/db/schema.ts` may need these columns. Check the existing schema and ensure it has:
- ebayOrderId (text, primary key or unique)
- shopifyOrderId (text)
- shopifyOrderName (text)
- status (text: synced, failed, cancelled)
- syncedAt (timestamp)
- ebayData (text, nullable — JSON blob of raw eBay order for debugging)

Also ensure the `sync_log` table has:
- id (integer, autoincrement)
- direction (text: ebay_to_shopify, shopify_to_ebay)
- entityType (text: order, product, inventory)
- entityId (text)
- status (text: success, failed)
- detail (text, nullable)
- createdAt (timestamp)

## Task 7: Update Scopes

In `src/cli/auth.ts`, ensure the eBay scopes include `sell.fulfillment`:
```
https://api.ebay.com/oauth/api_scope
https://api.ebay.com/oauth/api_scope/sell.inventory
https://api.ebay.com/oauth/api_scope/sell.fulfillment
https://api.ebay.com/oauth/api_scope/sell.account
https://api.ebay.com/oauth/api_scope/sell.marketing
```

In `src/shopify/client.ts`, add `write_orders` to scopes (needed to CREATE orders):
```
scopes: ['read_products', 'read_inventory', 'read_orders', 'write_orders']
```

## Important Notes
- Use the existing `ebayRequest` function from `src/ebay/client.ts` for eBay API calls
- Use the existing `getDb` function from `src/db/client.ts` for database access  
- Use `drizzle-orm` patterns consistent with existing code
- All functions should be async and properly typed
- Run `npx tsc --noEmit` to verify no type errors before committing
- Don't modify package.json dependencies unless absolutely necessary
- Keep error handling consistent with existing patterns (throw Error with descriptive messages)
