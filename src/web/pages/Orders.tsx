import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Badge,
  Card,
  IndexTable,
  Layout,
  Page,
  Pagination,
  Spinner,
  Text,
} from '@shopify/polaris';

type Order = {
  id: number;
  ebayOrderId: string;
  shopifyOrderId: string;
  shopifyOrderName?: string | null;
  status: string;
  syncedAt?: number | null;
};

type OrdersResponse = {
  data: Order[];
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
  if (normalized === 'synced' || normalized === 'success') {
    return <Badge tone="success">Synced</Badge>;
  }
  if (normalized === 'pending') {
    return <Badge tone="warning">Pending</Badge>;
  }
  if (normalized === 'failed' || normalized === 'error') {
    return <Badge tone="critical">Error</Badge>;
  }
  return <Badge tone="info">{status ?? 'Unknown'}</Badge>;
};

const Orders: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders?limit=${limit}&offset=${offset}`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = (await response.json()) as OrdersResponse;
      setOrders(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

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
    <Page title="Orders">
      {error && (
        <Banner tone="critical" title="Unable to load orders">
          <p>{error}</p>
        </Banner>
      )}
      <Layout>
        <Layout.Section>
          <Card>
            {loading ? (
              <Spinner accessibilityLabel="Loading orders" size="large" />
            ) : (
              <IndexTable
                resourceName={{ singular: 'order', plural: 'orders' }}
                itemCount={orders.length}
                selectable={false}
                headings={[
                  { title: 'eBay Order ID' },
                  { title: 'Shopify Order ID' },
                  { title: 'Shopify Order Name' },
                  { title: 'Status' },
                  { title: 'Synced At' },
                ]}
              >
                {orders.map((order: Order, index: number) => (
                  <IndexTable.Row id={String(order.id)} key={order.id} position={index}>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {order.ebayOrderId}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {order.shopifyOrderId}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodyMd">
                        {order.shopifyOrderName ?? '—'}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{statusBadge(order.status)}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span" variant="bodySm">
                        {formatTimestamp(order.syncedAt)}
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

export default Orders;
