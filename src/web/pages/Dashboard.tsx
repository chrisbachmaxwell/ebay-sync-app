import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Card,
  Layout,
  List,
  Page,
  ResourceList,
  Spinner,
  Text,
} from '@shopify/polaris';

type StatusResponse = {
  status: string;
  products: { mapped: number };
  orders: { imported: number };
  lastSyncs: Array<Record<string, unknown>>;
  recentNotifications: LogEntry[];
  settings: Record<string, string>;
  uptime: number;
};

type LogEntry = {
  id: number;
  source: string;
  topic: string;
  status: string;
  createdAt: string;
  payload: string;
};

const formatDateTime = (value?: string | number | null) => {
  if (!value) {
    return '—';
  }

  if (typeof value === 'number') {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(ms).toLocaleString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const formatStatusBadge = (status?: string) => {
  if (!status) {
    return <Badge tone="info">Unknown</Badge>;
  }

  const normalized = status.toLowerCase();
  if (normalized === 'running') {
    return <Badge tone="success">Running</Badge>;
  }
  if (normalized === 'idle') {
    return <Badge tone="warning">Idle</Badge>;
  }
  if (normalized === 'error' || normalized === 'failed') {
    return <Badge tone="critical">Error</Badge>;
  }

  return <Badge tone="info">{status}</Badge>;
};

const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [statusRes, logsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/logs?limit=5'),
      ]);

      if (!statusRes.ok) {
        throw new Error('Failed to load status');
      }

      const statusJson = (await statusRes.json()) as StatusResponse;
      setStatus(statusJson);

      if (logsRes.ok) {
        const logsJson = (await logsRes.json()) as { data: LogEntry[] };
        setLogs(logsJson.data ?? []);
      } else {
        setLogs([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const response = await fetch('/api/sync/trigger', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to trigger sync');
      }
      const result = (await response.json()) as { message?: string };
      setSyncMessage(result.message ?? 'Sync triggered successfully');
      void loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to trigger sync');
    } finally {
      setSyncing(false);
    }
  };

  const settingsList = useMemo(() => {
    if (!status?.settings) {
      return [] as Array<[string, string]>;
    }

    return Object.entries(status.settings);
  }, [status?.settings]);

  return (
    <Page
      title="Dashboard"
      primaryAction={{
        content: 'Sync Now',
        onAction: handleSyncNow,
        loading: syncing,
      }}
    >
      {error && (
        <Banner tone="critical" title="Something went wrong">
          <p>{error}</p>
        </Banner>
      )}
      {syncMessage && (
        <Banner tone="success" title="Sync started">
          <p>{syncMessage}</p>
        </Banner>
      )}
      {loading && (
        <Layout>
          <Layout.Section>
            <Card>
              <Spinner accessibilityLabel="Loading dashboard" size="large" />
            </Card>
          </Layout.Section>
        </Layout>
      )}
      {!loading && status && (
        <Layout>
          <Layout.Section>
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <Text variant="headingSm" as="h3">
                    Products Mapped
                  </Text>
                  <Text variant="headingLg" as="p">
                    {status.products?.mapped ?? 0}
                  </Text>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <Text variant="headingSm" as="h3">
                    Orders Imported
                  </Text>
                  <Text variant="headingLg" as="p">
                    {status.orders?.imported ?? 0}
                  </Text>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card>
                  <Text variant="headingSm" as="h3">
                    Sync Status
                  </Text>
                  <Text variant="headingLg" as="p">
                    {formatStatusBadge(status.status)}
                  </Text>
                </Card>
              </Layout.Section>
            </Layout>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <Text variant="headingSm" as="h3">
                Recent activity
              </Text>
              <ResourceList
                resourceName={{ singular: 'notification', plural: 'notifications' }}
                items={logs.slice(0, 5)}
                renderItem={(item: LogEntry) => {
                  return (
                    <ResourceList.Item id={String(item.id)} onClick={() => {}}>
                      <Text variant="bodyMd" as="p">
                        {item.topic}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        {item.source} • {formatDateTime(item.createdAt)}
                      </Text>
                    </ResourceList.Item>
                  );
                }}
              />
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <Card>
              <Text variant="headingSm" as="h3">
                Current settings
              </Text>
              {settingsList.length === 0 ? (
                <Text tone="subdued" as="p">
                  No settings found.
                </Text>
              ) : (
                <List>
                  {settingsList.map(([key, value]: [string, string]) => (
                    <List.Item key={key}>
                      <Text as="span" variant="bodyMd" fontWeight="medium">
                        {key}
                      </Text>{' '}
                      <Text as="span" variant="bodyMd">
                        {String(value)}
                      </Text>
                    </List.Item>
                  ))}
                </List>
              )}
            </Card>
          </Layout.Section>
        </Layout>
      )}
    </Page>
  );
};

export default Dashboard;
