import { Command } from 'commander';
import ora from 'ora';
import { requestShopifyClientCredentialsToken } from '../shopify/client.js';
import { exchangeEbayAuthCode } from '../ebay/client.js';
import { startEbayAuthFlow } from '../ebay/auth.js';
import { getDb } from '../db/client.js';
import { authTokens } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { info } from '../utils/logger.js';

const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.account',
];

const upsertToken = async (platform: string, token: {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresIn: number;
}) => {
  const db = await getDb();
  const existing = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.platform, platform))
    .get();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + token.expiresIn * 1000);

  if (existing) {
    await db
      .update(authTokens)
      .set({
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? null,
        scope: token.scope ?? null,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(authTokens.platform, platform))
      .run();
  } else {
    await db
      .insert(authTokens)
      .values({
        platform,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken ?? null,
        scope: token.scope ?? null,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
};

const fetchToken = async (platform: string) => {
  const db = await getDb();
  return db.select().from(authTokens).where(eq(authTokens.platform, platform)).get();
};

export const buildAuthCommand = () => {
  const auth = new Command('auth').description('Authentication commands');

  auth
    .command('shopify')
    .description('OAuth flow for Shopify access token')
    .action(async () => {
      const spinner = ora('Requesting Shopify access token').start();
      try {
        const accessToken = await requestShopifyClientCredentialsToken();
        await upsertToken('shopify', { accessToken, expiresIn: 24 * 60 * 60 });
        spinner.succeed('Shopify access token saved');
      } catch (error) {
        spinner.fail(error instanceof Error ? error.message : 'Shopify auth failed');
        process.exitCode = 1;
      }
    });

  auth
    .command('ebay')
    .description('OAuth flow for eBay user token')
    .action(async () => {
      const spinner = ora('Starting eBay authorization').start();
      try {
        const { code, redirectUri } = await startEbayAuthFlow(EBAY_SCOPES);
        const token = await exchangeEbayAuthCode(code, redirectUri);
        await upsertToken('ebay', {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
          scope: token.scope,
          expiresIn: token.expiresIn,
        });
        spinner.succeed('eBay user token saved');
      } catch (error) {
        spinner.fail(error instanceof Error ? error.message : 'eBay auth failed');
        process.exitCode = 1;
      }
    });

  auth
    .command('status')
    .description('Check auth status for both platforms')
    .action(async () => {
      const shopify = await fetchToken('shopify');
      const ebay = await fetchToken('ebay');

      info(`Shopify: ${shopify ? 'connected' : 'missing'}`);
      info(`eBay: ${ebay ? 'connected' : 'missing'}`);
    });

  return auth;
};
