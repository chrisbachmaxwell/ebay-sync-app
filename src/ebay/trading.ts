import { ebayRequest } from './client.js';

/**
 * eBay Account API — manage business policies.
 * Used to get fulfillment, payment, and return policies for listing creation.
 */

export interface EbayPolicy {
  policyId: string;
  name: string;
  description?: string;
  marketplaceId: string;
}

/**
 * Get fulfillment policies for the seller.
 */
export const getFulfillmentPolicies = async (
  accessToken: string,
  marketplaceId = 'EBAY_US',
): Promise<{ fulfillmentPolicies: EbayPolicy[] }> => {
  return ebayRequest({
    path: `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}`,
    accessToken,
  });
};

/**
 * Get payment policies for the seller.
 */
export const getPaymentPolicies = async (
  accessToken: string,
  marketplaceId = 'EBAY_US',
): Promise<{ paymentPolicies: EbayPolicy[] }> => {
  return ebayRequest({
    path: `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}`,
    accessToken,
  });
};

/**
 * Get return policies for the seller.
 */
export const getReturnPolicies = async (
  accessToken: string,
  marketplaceId = 'EBAY_US',
): Promise<{ returnPolicies: EbayPolicy[] }> => {
  return ebayRequest({
    path: `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}`,
    accessToken,
  });
};

/**
 * Get all business policies (convenience wrapper).
 */
export const getAllPolicies = async (
  accessToken: string,
  marketplaceId = 'EBAY_US',
): Promise<{
  fulfillment: EbayPolicy[];
  payment: EbayPolicy[];
  returns: EbayPolicy[];
}> => {
  const [fulfillment, payment, returns] = await Promise.all([
    getFulfillmentPolicies(accessToken, marketplaceId),
    getPaymentPolicies(accessToken, marketplaceId),
    getReturnPolicies(accessToken, marketplaceId),
  ]);

  return {
    fulfillment: fulfillment.fulfillmentPolicies || [],
    payment: payment.paymentPolicies || [],
    returns: returns.returnPolicies || [],
  };
};
