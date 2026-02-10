import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  IndexTable,
  Layout,
  Page,
  Select,
  Spinner,
  Text,
} from '@shopify/polaris';

type LogEntry = {
  id: number;
  source: string;
  topic: string;
  status: string;
  createdAt: string;
  payload: string;
};

type LogsResponse = {
  data: LogEntry[];
};

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

const sourceBadge = (source?: string) => {
  const normalized = source?.toLowerCase();
  if (normalized === 'ebay') {
    return <Badge tone="success">eBay</Badge>;
  }
  if (normalized === 'shopify') {
    return <Badge tone="info">Shopify</Badge>;
  }
  return <Badge tone="warning">{source ?? 'Unknown'}</Badge>;
};

const parsePayload = (payload: string) => {
  try {
    const parsed = JSON.parse(payload);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return payload;
  }
};

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [source, setSource] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = source === 'all' ? '' : `?source=${source}`;
      const response = await fetch(`/api/logs${query}`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = (await response.json()) as LogsResponse;
      setLogs(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const rows = useMemo(() => {
    return logs.map((log: LogEntry, index: number) => {
      const isExpanded = expandedIds.has(log.id);
      const payload = parsePayload(log.payload);

      return (
        <IndexTable.Row id={String(log.id)} key={log.id} position={index}>
          <IndexTable.Cell>
            <Text as="span" variant="bodyMd">
              {log.id}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>{sourceBadge(log.source)}</IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodyMd">
              {log.topic}
            </Text>
            <div>
              <Button variant="plain" onClick={() => toggleExpanded(log.id)}>
                {isExpanded ? 'Hide payload' : 'View payload'}
              </Button>
            </div>
            {isExpanded && (
              <div style={{ marginTop: '8px' }}>
                <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {payload}
                </pre>
              </div>
            )}
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodyMd">
              {log.status}
            </Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <Text as="span" variant="bodySm">
              {formatDateTime(log.createdAt)}
            </Text>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    });
  }, [expandedIds, logs]);

  return (
    <Page title="Logs">
      {error && (
        <Banner tone="critical" title="Unable to load logs">
          <p>{error}</p>
        </Banner>
      )}
      <Layout>
        <Layout.Section>
          <Card>
            <Select
              label="Filter by source"
              options={[
                { label: 'All', value: 'all' },
                { label: 'eBay', value: 'ebay' },
                { label: 'Shopify', value: 'shopify' },
              ]}
              value={source}
              onChange={setSource}
            />
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            {loading ? (
              <Spinner accessibilityLabel="Loading logs" size="large" />
            ) : (
              <IndexTable
                resourceName={{ singular: 'log', plural: 'logs' }}
                itemCount={logs.length}
                selectable={false}
                headings={[
                  { title: 'ID' },
                  { title: 'Source' },
                  { title: 'Topic' },
                  { title: 'Status' },
                  { title: 'Created At' },
                ]}
              >
                {rows}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Logs;
