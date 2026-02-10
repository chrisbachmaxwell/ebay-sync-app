import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const productMappings = sqliteTable('product_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shopifyProductId: text('shopify_product_id').notNull(),
  ebayListingId: text('ebay_listing_id').notNull(),
  ebayInventoryItemId: text('ebay_inventory_item_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

export const orderMappings = sqliteTable('order_mappings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ebayOrderId: text('ebay_order_id').notNull(),
  shopifyOrderId: text('shopify_order_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entityType: text('entity_type').notNull(),
  action: text('action').notNull(),
  status: text('status').notNull(),
  message: text('message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

export const authTokens = sqliteTable('auth_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  platform: text('platform').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  scope: text('scope'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().defaultNow(),
});
