import { Command } from 'commander';
import { getDb } from '../db/client.js';
import { authTokens } from '../db/schema.js';
import { eq } from 'drizzle-orm';
export const buildStatusCommand = () => {
    const status = new Command('status').description('Overall sync health');
    status.action(async () => {
        const db = await getDb();
        const shopify = await db.select().from(authTokens).where(eq(authTokens.platform, 'shopify')).get();
        const ebay = await db.select().from(authTokens).where(eq(authTokens.platform, 'ebay')).get();
        console.log(`Shopify auth: ${shopify ? 'connected' : 'missing'}`);
        console.log(`eBay auth: ${ebay ? 'connected' : 'missing'}`);
    });
    return status;
};
