import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import * as schema from './schema.js';

const DB_DIR = path.join(os.homedir(), '.clawdbot');
const DB_PATH = path.join(DB_DIR, 'ebaysync.db');

export const ensureDbPath = async (): Promise<string> => {
  await fs.mkdir(DB_DIR, { recursive: true });
  return DB_PATH;
};

let dbInstance: ReturnType<typeof drizzle> | null = null;

const initTables = (sqlite: InstanceType<typeof Database>) => {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS product_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_product_id TEXT NOT NULL,
      ebay_listing_id TEXT NOT NULL,
      ebay_inventory_item_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS order_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ebay_order_id TEXT NOT NULL,
      shopify_order_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      scope TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
};

export const getDb = async () => {
  if (!dbInstance) {
    const filePath = await ensureDbPath();
    const sqlite = new Database(filePath);
    initTables(sqlite);
    dbInstance = drizzle(sqlite, { schema });
  }

  return dbInstance;
};
