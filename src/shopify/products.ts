import { createShopifyGraphqlClient } from './client.js';

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
};

export const fetchShopifyProducts = async (accessToken: string, first = 20): Promise<ShopifyProduct[]> => {
  const client = await createShopifyGraphqlClient(accessToken);
  const query = `#graphql
    query Products($first: Int!) {
      products(first: $first) {
        edges {
          node {
            id
            title
            handle
            status
          }
        }
      }
    }
  `;

  const response = await client.request(query, {
    variables: { first },
  }) as { data?: { products?: { edges?: Array<{ node: ShopifyProduct }> } } };

  if (!response.data?.products?.edges) {
    throw new Error('Unexpected Shopify response while listing products');
  }

  return response.data.products.edges.map((edge) => edge.node);
};
