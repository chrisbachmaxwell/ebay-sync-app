import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Card,
  IndexTable,
  Layout,
  Page,
  Pagination,
  Spinner,
  Text,
} from '@shopify/polaris';

type Listing = {
  id: number;
  shopifyProductId: string;
  ebayListingId: string;
  ebayInventoryItemId?: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
};

type ListingsResponse = {
  data: Listing[];
  total: number;
  limit: number;
  offset: number;
};

const formatTimestamp = (value?: number | null) => {
  if (!value) {
    return '—';
  }
  const ms = value > 1_000_000_000_000 ? value : value * 1000;
  return new Date(ms).toLocaleString();
};

const statusBadge = (status?: string) => {
  const normalized = status?.toLowerCase();
  if (normalized === 'active') {
    return <Badge tone="success">Active</Badge>;
  }
  if (normalized === 'inactive') {
    return <Badge tone="warning">Inactive</Badge>;
  }
  if (normalized === 'error' || normalized === 'failed') {
    return <Badge tone="critical">Error</Badge>;
  }
  return <Badge tone="info">{status ?? 'Unknown'}</Badge>;
};

const Listings: React.FC = () => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/listings?limit=${limit}&offset=${offset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch listings');
      }
      const data = (await response.json()) as ListingsResponse;
      setListings(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch listings');
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const pagination = useMemo(() => {
    const hasPrevious = offset > 0;
    const hasNext = offset + limit < total;

    return (
      <Pagination
        hasPrevious={hasPrevious}
        onPrevious={() => setOffset(Math.max(0, offset - limit))}
        hasNext={hasNext}
        onNext={() => setOffset(offset + limit)}
      />
    );
  }, [limit, offset, total]);

  return (
    <Page title="Listings">
      {error && (
        <Banner tone="critical" title="Unable to load listings">
          <p>{error}</p>
        </Banner>
      )}
      <Layout>
        <Layout.Section>
          <Card>
            {loading ? (
              <Spinner accessibilityLabel="Loading listings" size="large" />
            ) : (
              <IndexTable
                resourceName={{ singular: 'listing', plural: 'listings' }}
                itemCount={listings.length}
                selectable={false}
                headings={[
                  { title: 'Shopify Product ID' },
                  { title: 'eBay Listing ID' },
                  { title: 'eBay Inventory Item ID' },
                  { title: 'Status' },
                  { title: 'Created' },
                  { title: 'Updated' },
                ]}
              >
                {listings.map((listing: Listing, index: number) => (
                  <IndexTable.Row id={String(listing.id)} key={listing.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {listing.shopifyProductId}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {listing.ebayListingId}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {listing.ebayInventoryItemId ?? '—'}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{statusBadge(listing.status)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">
                        {formatTimestamp(listing.createdAt)}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">
                        {formatTimestamp(listing.updatedAt)}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
        <Layout.Section>
          {pagination}
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Listings;
