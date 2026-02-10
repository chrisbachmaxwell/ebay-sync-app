import { ebayRequest } from './client.js';

/**
 * eBay Browse API — search and view listings.
 * Useful for checking if a listing exists on eBay.
 */

export interface EbayBrowseItem {
  itemId: string;
  title: string;
  price: { value: string; currency: string };
  condition: string;
  image?: { imageUrl: string };
  seller: { username: string };
  itemWebUrl: string;
}

export interface EbaySearchResult {
  total: number;
  limit: number;
  offset: number;
  itemSummaries?: EbayBrowseItem[];
}

/**
 * Search eBay listings (uses application token, not user token).
 */
export const searchEbayListings = async (
  accessToken: string,
  query: string,
  options: { limit?: number; offset?: number; categoryId?: string } = {},
): Promise<EbaySearchResult> => {
  const params = new URLSearchParams();
  params.set('q', query);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.categoryId) params.set('category_ids', options.categoryId);

  return ebayRequest<EbaySearchResult>({
    path: `/buy/browse/v1/item_summary/search?${params.toString()}`,
    accessToken,
    headers: { 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
  });
};

/**
 * Get a specific eBay item by ID.
 */
export const getEbayItem = async (
  accessToken: string,
  itemId: string,
): Promise<EbayBrowseItem> => {
  return ebayRequest<EbayBrowseItem>({
    path: `/buy/browse/v1/item/${itemId}`,
    accessToken,
    headers: { 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
  });
};
