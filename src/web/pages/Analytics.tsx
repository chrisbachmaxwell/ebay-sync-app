import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  Select,
  TextField,
  Button,
  ButtonGroup,
  DataTable,
  Badge,
  Text,
  Banner,
  Modal,
  SkeletonBodyText,
  EmptyState
} from '@shopify/polaris';
import {
  SearchIcon
} from '@shopify/polaris-icons';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend
} from 'recharts';

// Mock hook for now
const useApi = <T,>(url: string) => {
  return {
    data: {
      logs: [
        {
          id: '1',
          timestamp: new Date().toISOString(),
          level: 'info' as const,
          message: 'Sync completed successfully',
          source: 'sync-service',
          details: { products: 10, errors: 0 }
        }
      ],
      total: 1,
      metrics: [
        {
          date: '2024-01-01',
          total_syncs: 10,
          successful_syncs: 8,
          failed_syncs: 2,
          avg_duration: 30
        }
      ],
      errors: []
    } as T,
    loading: false,
    error: null
  };
};

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
  source: string;
  sync_id?: string;
}

interface SyncMetrics {
  date: string;
  total_syncs: number;
  successful_syncs: number;
  failed_syncs: number;
  avg_duration: number;
}

interface ErrorSummary {
  error_type: string;
  count: number;
  last_occurrence: string;
  sample_message: string;
}

const Analytics: React.FC = () => {
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [selectedDateRange, setSelectedDateRange] = useState('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Build API query params
  const queryParams = new URLSearchParams();
  if (selectedLevel) queryParams.set('level', selectedLevel);
  queryParams.set('limit', limit.toString());
  queryParams.set('offset', ((page - 1) * limit).toString());
  if (searchQuery) queryParams.set('search', searchQuery);

  const { data: logsData, loading: logsLoading, error: logsError } = useApi<{
    logs: LogEntry[];
    total: number;
    metrics: SyncMetrics[];
    errors: ErrorSummary[];
  }>(`/api/logs?${queryParams}`);

  const successColor = '#00A651';
  const errorColor = '#D82C0D';
  const pieData = logsData?.metrics ? [
    { name: 'Successful', value: logsData.metrics.reduce((sum, m) => sum + m.successful_syncs, 0), color: successColor },
    { name: 'Failed', value: logsData.metrics.reduce((sum, m) => sum + m.failed_syncs, 0), color: errorColor }
  ] : [];

  const levelOptions = [
    { label: 'All Levels', value: '' },
    { label: 'Info', value: 'info' },
    { label: 'Warning', value: 'warn' },
    { label: 'Error', value: 'error' }
  ];

  const dateRangeOptions = [
    { label: 'Last 24 hours', value: '1d' },
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' }
  ];

  const handleSearch = () => {
    setPage(1); // Reset to first page when searching
  };

  const handleLogClick = (log: LogEntry) => {
    setSelectedLog(log);
    setDetailModalOpen(true);
  };

  const getBadgeTone = (level: string) => {
    switch (level) {
      case 'error': return 'critical';
      case 'warn': return 'warning';
      default: return 'info';
    }
  };

  const renderLogRow = (log: LogEntry) => {
    return [
      <Text as="span" variant="bodySm" tone="subdued">
        {new Date(log.timestamp).toLocaleString()}
      </Text>,
      <Badge tone={getBadgeTone(log.level)}>{log.level.toUpperCase()}</Badge>,
      <Text as="span" variant="bodySm">{log.source}</Text>,
      <Text as="span" variant="bodySm">{log.message}</Text>,
      <Button
        variant="plain"
        size="micro"
        onClick={() => handleLogClick(log)}
      >
        View
      </Button>
    ];
  };

  if (logsLoading) {
    return (
      <Page title="Analytics & Logs">
        <Card>
          <SkeletonBodyText lines={10} />
        </Card>
      </Page>
    );
  }

  if (logsError) {
    return (
      <Page title="Analytics & Logs">
        <Banner tone="critical">
          <p>Failed to load analytics data</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Analytics & Logs"
      subtitle="Monitor sync performance and troubleshoot issues"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Performance Charts */}
        <div style={{ display: 'flex', gap: '16px' }}>
          <Card>
            <div style={{ padding: '16px' }}>
              <Text as="h2" variant="headingMd">Sync Volume Over Time</Text>
              {logsData?.metrics?.length ? (
                <div style={{ width: '100%', height: '300px', marginTop: '16px' }}>
                  <ResponsiveContainer>
                    <LineChart data={logsData.metrics}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <RechartsTooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="successful_syncs" 
                        stroke={successColor} 
                        name="Successful" 
                        strokeWidth={2}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="failed_syncs" 
                        stroke={errorColor} 
                        name="Failed"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  heading="No sync data available"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start syncing products to see performance metrics.</p>
                </EmptyState>
              )}
            </div>
          </Card>

          <Card>
            <div style={{ padding: '16px' }}>
              <Text as="h2" variant="headingMd">Success vs Failure Ratio</Text>
              {pieData.length ? (
                <div style={{ width: '100%', height: '300px', marginTop: '16px' }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  heading="No sync data available"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Start syncing products to see success metrics.</p>
                </EmptyState>
              )}
            </div>
          </Card>
        </div>

        {/* Error Aggregation */}
        {logsData?.errors && logsData.errors.length > 0 && (
          <Card>
            <div style={{ padding: '16px' }}>
              <Text as="h2" variant="headingMd">Common Errors</Text>
              <DataTable
                columnContentTypes={['text', 'numeric', 'text', 'text']}
                headings={['Error Type', 'Count', 'Last Seen', 'Sample Message']}
                rows={logsData.errors.map((error) => [
                  <Text as="span" fontWeight="semibold">{error.error_type}</Text>,
                  <Badge tone="critical">{String(error.count)}</Badge>,
                  <Text as="span" variant="bodySm" tone="subdued">
                    {new Date(error.last_occurrence).toLocaleString()}
                  </Text>,
                  <Text as="span" variant="bodySm">{error.sample_message}</Text>
                ])}
              />
            </div>
          </Card>
        )}

        {/* Log Filters and Table */}
        <Card>
          <div style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ minWidth: '120px' }}>
                <Select
                  label="Level"
                  options={levelOptions}
                  value={selectedLevel}
                  onChange={setSelectedLevel}
                />
              </div>
              <div style={{ minWidth: '150px' }}>
                <Select
                  label="Date Range"
                  options={dateRangeOptions}
                  value={selectedDateRange}
                  onChange={setSelectedDateRange}
                />
              </div>
              <div style={{ minWidth: '200px' }}>
                <TextField
                  label="Search"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="Search messages..."
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => setSearchQuery('')}
                />
              </div>
              <Button
                variant="primary"
                icon={SearchIcon}
                onClick={handleSearch}
              >
                Search
              </Button>
            </div>

            {logsData?.logs && (
              <>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Timestamp', 'Level', 'Source', 'Message', 'Actions']}
                  rows={logsData.logs.map(renderLogRow)}
                  truncate
                />

                {/* Pagination */}
                <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                  <ButtonGroup>
                    <Button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      disabled={!logsData.logs || logsData.logs.length < limit}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </ButtonGroup>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Log Detail Modal */}
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Log Details"
        size="large"
      >
        {selectedLog && (
          <Modal.Section>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '32px' }}>
                <div style={{ flex: 1 }}>
                  <Text as="dt" variant="headingXs">Timestamp:</Text>
                  <Text as="dd">{new Date(selectedLog.timestamp).toLocaleString()}</Text>
                </div>
                <div style={{ flex: 1 }}>
                  <Text as="dt" variant="headingXs">Level:</Text>
                  <Badge tone={getBadgeTone(selectedLog.level)}>
                    {selectedLog.level.toUpperCase()}
                  </Badge>
                </div>
              </div>
              
              <div>
                <Text as="dt" variant="headingXs">Source:</Text>
                <Text as="dd">{selectedLog.source}</Text>
              </div>

              <div>
                <Text as="dt" variant="headingXs">Message:</Text>
                <Text as="dd">{selectedLog.message}</Text>
              </div>

              {selectedLog.sync_id && (
                <div>
                  <Text as="dt" variant="headingXs">Sync ID:</Text>
                  <Text as="dd">{selectedLog.sync_id}</Text>
                </div>
              )}

              {selectedLog.details && (
                <div>
                  <Text as="dt" variant="headingXs">Details:</Text>
                  <pre style={{
                    background: '#f6f6f7',
                    padding: '12px',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontSize: '12px',
                    maxHeight: '300px'
                  }}>
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </Modal.Section>
        )}
      </Modal>
    </Page>
  );
};

export default Analytics;