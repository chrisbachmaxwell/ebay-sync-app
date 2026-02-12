import React, { useState, useEffect, useMemo } from 'react';
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
import { useLogs, useListingHealth } from '../hooks/useApi';

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

  // Real API calls
  const { data: rawLogsData, isLoading: logsLoading, error: logsError } = useLogs(limit);
  const { data: healthData, isLoading: healthLoading } = useListingHealth();
  
  // Process logs data to match expected format
  const logsData = useMemo(() => {
    if (!rawLogsData?.data) return null;
    
    // Convert logs to expected format
    const logs: LogEntry[] = rawLogsData.data.map((log: any) => ({
      id: log.id?.toString() || Math.random().toString(),
      timestamp: log.createdAt || log.timestamp || new Date().toISOString(),
      level: log.status === 'error' ? 'error' as const : 
             log.status === 'warning' ? 'warn' as const : 'info' as const,
      message: log.topic || log.message || 'No message',
      source: log.source || 'unknown',
      details: log.payload ? JSON.parse(log.payload) : null,
      sync_id: log.sync_id
    }));
    
    // Filter logs based on current filters
    const filteredLogs = logs.filter(log => {
      if (selectedLevel && log.level !== selectedLevel) return false;
      if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    
    // Generate mock metrics for demo (would come from API in real implementation)
    const metrics: SyncMetrics[] = [];
    const errors: ErrorSummary[] = [];
    
    // Group errors by type
    const errorMap = new Map<string, { count: number; lastSeen: string; sample: string }>();
    logs.filter(log => log.level === 'error').forEach(log => {
      const errorType = log.message.split(':')[0] || 'Unknown Error';
      const existing = errorMap.get(errorType);
      if (existing) {
        existing.count++;
        if (new Date(log.timestamp) > new Date(existing.lastSeen)) {
          existing.lastSeen = log.timestamp;
          existing.sample = log.message;
        }
      } else {
        errorMap.set(errorType, {
          count: 1,
          lastSeen: log.timestamp,
          sample: log.message
        });
      }
    });
    
    errorMap.forEach((value, key) => {
      errors.push({
        error_type: key,
        count: value.count,
        last_occurrence: value.lastSeen,
        sample_message: value.sample
      });
    });
    
    return {
      logs: filteredLogs.slice((page - 1) * limit, page * limit),
      total: filteredLogs.length,
      metrics,
      errors
    };
  }, [rawLogsData, selectedLevel, searchQuery, page, limit]);

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

  if (logsLoading || healthLoading) {
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