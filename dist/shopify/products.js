import { createShopifyGraphqlClient } from './client.js';
export const fetchShopifyProducts = async (accessToken, first = 20) => {
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
    });
    if (!response.data?.products?.edges) {
        throw new Error('Unexpected Shopify response while listing products');
    }
    return response.data.products.edges.map((edge) => edge.node);
};
