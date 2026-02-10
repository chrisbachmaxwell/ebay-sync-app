import Database from 'better-sqlite3';
export declare const ensureDbPath: () => Promise<string>;
export declare const getDb: () => Promise<import("drizzle-orm/better-sqlite3").BetterSQLite3Database<Record<string, unknown>> & {
    $client: Database.Database;
}>;
