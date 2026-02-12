import React from 'react';
import {
  Badge,
  Banner,
  Card,
  Layout,
  Page,
  Button,
  ButtonGroup,
  Spinner,
  Text,
  DataTable,
} from '@shopify/polaris';
import { 
  RefreshCw, 
  Package, 
  ShoppingCart, 
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Zap,
  BarChart3
} from 'lucide-react';
import { useStatus, useLogs, useSyncProducts, useSyncOrders, useSyncInventory, useListingHealth } from '../hooks/useApi';
import { useAppStore } from '../store';
import StatusIndicator from '../components/StatusIndicator';
import MetricCard from '../components/MetricCard';

const Dashboard: React.FC = () => {
  const { data: statusData, isLoading, error } = useStatus();
  const { data: logsData } = useLogs(10);
  const { data: healthData } = useListingHealth();
  const { notifications } = useAppStore();
  
  const syncProducts = useSyncProducts();
  const syncOrders = useSyncOrders();
  const syncInventory = useSyncInventory();

  const handleSyncProducts = () => syncProducts.mutate({});
  const handleSyncOrders = () => syncOrders.mutate({});
  const handleSyncInventory = () => syncInventory.mutate({});

  // Format activity data for DataTable
  const activityRows = logsData?.data?.slice(0, 5).map(log => [
    log.topic,
    log.source,
    <Badge key={log.id} tone={log.status === 'success' ? 'success' : log.status === 'error' ? 'critical' : 'info'}>
      {log.status}
    </Badge>,
    new Date(log.createdAt).toLocaleString(),
  ]) || [];

  const formatDateTime = (value?: string | number | null) => {
    if (!value) return '—';
    if (typeof value === 'number') {
      const ms = value > 1_000_000_000_000 ? value : value * 1000;
      return new Date(ms).toLocaleString();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  };

  if (error) {
    return (
      <Page title="Dashboard">
        <Banner tone="critical" title="Failed to load dashboard">
          <p>{error.message}</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page title="eBay Sync Dashboard">
      {/* Notifications */}
      {notifications.slice(0, 3).map((notification) => (
        <Banner
          key={notification.id}
          tone={notification.type === 'error' ? 'critical' : notification.type === 'warning' ? 'warning' : 'success'}
          title={notification.title}
          onDismiss={() => {}}
        >
          {notification.message && <p>{notification.message}</p>}
        </Banner>
      ))}

      <Layout>
        {/* Hero Section - Sync Status */}
        <Layout.Section>
          <Card>
            <div className="text-center py-8">
              <div className="mb-4">
                {isLoading ? (
                  <Spinner size="large" />
                ) : (
                  <StatusIndicator
                    type="sync"
                    status={statusData?.status === 'running' ? 'syncing' : statusData?.status === 'error' ? 'error' : 'idle'}
                    size="lg"
                  />
                )}
              </div>
              <Text variant="headingXl" as="h2">
                {isLoading ? 'Loading...' : `System ${statusData?.status || 'Unknown'}`}
              </Text>
              <Text variant="bodyLg" tone="subdued" as="p">
                {statusData?.lastSyncs?.[0] ? 
                  `Last sync: ${formatDateTime((statusData.lastSyncs[0] as any).timestamp || (statusData.lastSyncs[0] as any).createdAt)}` : 
                  'No recent sync activity'
                }
              </Text>
              
              <div className="mt-6 flex justify-center gap-4">
                <ButtonGroup>
                  <Button
                    variant="primary"
                    icon={<Package className="w-4 h-4" />}
                    loading={syncProducts.isPending}
                    onClick={handleSyncProducts}
                  >
                    Sync Products
                  </Button>
                  <Button
                    icon={<ShoppingCart className="w-4 h-4" />}
                    loading={syncOrders.isPending}
                    onClick={handleSyncOrders}
                  >
                    Sync Orders
                  </Button>
                  <Button
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={syncInventory.isPending}
                    onClick={handleSyncInventory}
                  >
                    Sync Inventory
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Metrics Grid */}
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            <MetricCard
              title="Products Mapped"
              value={statusData?.products?.mapped || 0}
              icon={<Package className="w-5 h-5" />}
              color="shopify"
              loading={isLoading}
              trend={{ value: 12, period: 'this week' }}
            />
            
            <MetricCard
              title="Orders Imported"
              value={statusData?.orders?.imported || 0}
              icon={<ShoppingCart className="w-5 h-5" />}
              color="ebay"
              loading={isLoading}
              trend={{ value: 8, period: 'this week' }}
            />
            
            <MetricCard
              title="Inventory Synced"
              value={statusData?.inventory?.synced || 0}
              icon={<CheckCircle className="w-5 h-5" />}
              color="success"
              loading={isLoading}
              trend={{ value: -2, period: 'today' }}
            />
            
            <MetricCard
              title="Pending Sync"
              value={statusData?.products?.pending || statusData?.orders?.pending || 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="warning"
              loading={isLoading}
            />
            
            <MetricCard
              title="Failed Items"
              value={statusData?.products?.failed || 0}
              icon={<Zap className="w-5 h-5" />}
              color="error"
              loading={isLoading}
            />
            
            <MetricCard
              title="Revenue Today"
              value={`$${(statusData?.revenue?.today || 0).toLocaleString()}`}
              icon={<DollarSign className="w-5 h-5" />}
              color="success"
              loading={isLoading}
              trend={{ value: 15, period: 'vs yesterday' }}
            />
          </div>
        </Layout.Section>

        {/* Connection Status */}
        <Layout.Section variant="oneHalf">
          <Card>
            <Text variant="headingMd" as="h3">
              Platform Connections
            </Text>
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-shopify-500 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm"></div>
                  </div>
                  <span className="font-medium">Shopify</span>
                </div>
                <StatusIndicator
                  type="connection"
                  status={statusData?.shopifyConnected ? 'connected' : 'disconnected'}
                  platform="shopify"
                  size="sm"
                />
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-ebay-500 rounded-full flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm"></div>
                  </div>
                  <span className="font-medium">eBay</span>
                </div>
                <StatusIndicator
                  type="connection"
                  status={statusData?.ebayConnected ? 'connected' : 'disconnected'}
                  platform="ebay"
                  size="sm"
                />
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Recent Activity */}
        <Layout.Section variant="oneHalf">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <Text variant="headingMd" as="h3">
                Recent Activity
              </Text>
              <Button
                icon={<BarChart3 className="w-4 h-4" />}
                variant="plain"
                onClick={() => {/* Navigate to full logs */}}
              >
                View All
              </Button>
            </div>
            
            {logsData?.data && logsData.data.length > 0 ? (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text']}
                headings={['Action', 'Source', 'Status', 'Time']}
                rows={activityRows}
                truncate
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Text variant="bodyLg" as="p">
                  No recent activity
                </Text>
              </div>
            )}
          </Card>
        </Layout.Section>

        {/* System Information */}
        <Layout.Section>
          <Card>
            <Text variant="headingMd" as="h3">
              System Information
            </Text>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <div className="text-center">
                <Text variant="headingSm" as="h4">
                  Uptime
                </Text>
                <Text variant="bodyLg" as="p">
                  {statusData?.uptime ? Math.floor(statusData.uptime / 3600) : 0}h
                </Text>
              </div>
              
              <div className="text-center">
                <Text variant="headingSm" as="h4">
                  Version
                </Text>
                <Text variant="bodyLg" as="p">
                  v0.2.0
                </Text>
              </div>
              
              <div className="text-center">
                <Text variant="headingSm" as="h4">
                  API Status
                </Text>
                <Text variant="bodyLg" as="p">
                  Online
                </Text>
              </div>
              
              <div className="text-center">
                <Text variant="headingSm" as="h4">
                  Last Restart
                </Text>
                <Text variant="bodyLg" as="p">
                  {statusData?.uptime ? formatDateTime(Date.now() - statusData.uptime * 1000) : '—'}
                </Text>
              </div>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};

export default Dashboard;