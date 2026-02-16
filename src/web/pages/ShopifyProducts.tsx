import React, { useMemo, useState, useCallback } from 'react';
import {
  Badge,
  Banner,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  IndexTable,
  InlineStack,
  BlockStack,
  Layout,
  Page,
  Pagination,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField,
  Thumbnail,
} from '@shopify/polaris';
import { ExternalLink, Filter, Play, Search, SortAsc, SortDesc } from 'lucide-react';
import {
  SearchIcon,
  CheckCircleIcon,
} from '@shopify/polaris-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, useListings } from '../hooks/useApi';
import { useAppStore } from '../store';
import PhotoGallery, { type GalleryImage } from '../components/PhotoGallery';
import PhotoControls, { type PhotoRoomParams } from '../components/PhotoControls';

/* ────────────────────────── helpers ────────────────────────── */

const PLACEHOLDER_IMG =
  'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';

const formatMoney = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') return '-';
  const numberValue = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(numberValue)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numberValue);
};

const formatTimestamp = (value?: number | string | null) => {
  if (!value) return '-';
  const ms = typeof value === 'number' ? (value > 1_000_000_000_000 ? value : value * 1000) : Date.parse(value);
  if (Number.isNaN(ms)) return '-';
  return new Date(ms).toLocaleString();
};

const getShopifyStatusBadge = (status?: string | null) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'active') return <Badge tone="success">Active</Badge>;
  if (normalized === 'draft') return <Badge>Draft</Badge>;
  if (normalized === 'archived') return <Badge tone="warning">Archived</Badge>;
  return <Badge>{status || 'unknown'}</Badge>;
};

const getEbayBadge = (status: string) => {
  if (status === 'listed') return <Badge tone="success">Listed</Badge>;
  if (status === 'draft') return <Badge tone="info">Draft</Badge>;
  return <Text as="span" tone="subdued">-</Text>;
};

const StatusDot: React.FC<{ done: boolean; label?: string }> = ({ done, label }) => (
  <InlineStack gap="100" blockAlign="center" wrap={false}>
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      backgroundColor: done ? '#22c55e' : '#d1d5db',
    }} />
    {label && <Text as="span" tone={done ? undefined : 'subdued'} variant="bodySm">{label}</Text>}
  </InlineStack>
);

interface ProductOverview {
  shopifyProductId: string;
  title: string;
  sku: string;
  price: string;
  shopifyStatus: string;
  imageUrl?: string | null;
  imageCount: number;
  hasAiDescription: boolean;
  hasProcessedImages: boolean;
  ebayStatus: 'listed' | 'draft' | 'not_listed';
  ebayListingId?: string | null;
  pipelineJobId?: string | null;
}

interface ProductsOverviewResponse {
  products: ProductOverview[];
  summary: {
    total: number;
    withDescriptions: number;
    withProcessedImages: number;
    listedOnEbay: number;
    draftOnEbay: number;
  };
}

/* ──────────────────── ShopifyProductDetail ──────────────────── */

export const ShopifyProductDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useAppStore();
  const [galleryViewMode, setGalleryViewMode] = useState<'side-by-side' | 'toggle'>('side-by-side');
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: productInfo, isLoading: productLoading } = useQuery({
    queryKey: ['product-info', id],
    queryFn: () => apiClient.get<{ ok: boolean; product?: any }>(`/test/product-info/${id}`),
    enabled: Boolean(id),
  });

  const { data: pipelineStatus } = useQuery({
    queryKey: ['product-pipeline-status', id],
    queryFn: () => apiClient.get<{ ok: boolean; status?: any }>(`/products/${id}/pipeline-status`),
    enabled: Boolean(id),
    retry: 1,
  });

  const { data: pipelineJobs } = useQuery({
    queryKey: ['pipeline-jobs', id],
    queryFn: () => apiClient.get<{ jobs: any[] }>(`/pipeline/jobs?productId=${id}&limit=1`),
    enabled: Boolean(id),
    refetchInterval: 10000,
  });

  // ── Phase 2: Fetch image gallery data ──
  const { data: imageData, isLoading: imagesLoading } = useQuery({
    queryKey: ['product-images', id],
    queryFn: () =>
      apiClient.get<{
        ok: boolean;
        images: GalleryImage[];
        totalOriginal: number;
        totalProcessed: number;
      }>(`/products/${id}/images`),
    enabled: Boolean(id),
    refetchInterval: 15000,
  });

  const galleryImages: GalleryImage[] = imageData?.images ?? [];

  const { data: listingResponse } = useListings({ limit: 50, offset: 0, search: id });
  const listing = useMemo(() => {
    const normalized = (listingResponse?.data ?? []).map((item: any) => ({
      shopifyProductId: String(item.shopifyProductId ?? item.shopify_product_id ?? item.shopifyProductID ?? item.id ?? ''),
      ebayListingId: item.ebayListingId ?? item.ebay_listing_id ?? item.ebayItemId ?? null,
      status: item.status ?? 'inactive',
    }));
    return normalized.find((item) => item.shopifyProductId === id) ?? normalized[0] ?? null;
  }, [listingResponse, id]);

  const product = productInfo?.product;
  const variant = product?.variant ?? product?.variants?.[0];
  const images: Array<{ id: number; src: string }> = product?.images ?? [];

  const pipelineJob = pipelineJobs?.jobs?.[0];
  const pipelineSteps = pipelineJob?.steps ?? [];
  const aiDescription = pipelineStatus?.status?.ai_description ?? null;

  const runPipelineMutation = useMutation({
    mutationFn: () => apiClient.post(`/auto-list/${id}`),
    onSuccess: (result: any) => {
      addNotification({ type: 'success', title: 'Pipeline started', message: result?.message ?? undefined, autoClose: 4000 });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Pipeline failed to start',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const aiMutation = useMutation({
    mutationFn: () => apiClient.post(`/auto-list/${id}`),
    onSuccess: () => {
      addNotification({ type: 'success', title: 'AI description generated', autoClose: 4000 });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'AI generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // ── Phase 2: Reprocess single image ──
  const reprocessMutation = useMutation({
    mutationFn: ({ imageUrl, params }: { imageUrl: string; params: PhotoRoomParams }) =>
      apiClient.post<{ ok: boolean; processedUrl?: string }>(`/products/${id}/images/reprocess`, {
        imageUrl,
        background: params.background,
        padding: params.padding,
        shadow: params.shadow,
      }),
    onSuccess: (data) => {
      setPreviewUrl(data?.processedUrl ?? null);
      queryClient.invalidateQueries({ queryKey: ['product-images', id] });
      addNotification({ type: 'success', title: 'Image reprocessed successfully', autoClose: 4000 });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Reprocessing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // ── Phase 2: Reprocess all images ──
  const reprocessAllMutation = useMutation({
    mutationFn: (params: PhotoRoomParams) =>
      apiClient.post<{ ok: boolean; succeeded: number; failed: number }>(`/products/${id}/images/reprocess-all`, {
        background: params.background,
        padding: params.padding,
        shadow: params.shadow,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['product-images', id] });
      addNotification({
        type: 'success',
        title: 'All images reprocessed',
        message: `${data?.succeeded ?? 0} succeeded, ${data?.failed ?? 0} failed`,
        autoClose: 4000,
      });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Bulk reprocessing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const handleReprocess = useCallback(
    (imageUrl: string, params: PhotoRoomParams) => {
      setPreviewUrl(null);
      reprocessMutation.mutate({ imageUrl, params });
    },
    [reprocessMutation],
  );

  const handleReprocessAll = useCallback(
    (params: PhotoRoomParams) => {
      reprocessAllMutation.mutate(params);
    },
    [reprocessAllMutation],
  );

  const handleSelectImage = useCallback((img: GalleryImage) => {
    setSelectedImageUrl((prev) => (prev === img.originalUrl ? null : img.originalUrl));
    setPreviewUrl(null);
  }, []);

  const statusBadge = product?.status ? getShopifyStatusBadge(product.status) : null;

  return (
    <Page
      title={product?.title ?? 'Loading product…'}
      subtitle={id ? `Shopify ID ${id}` : undefined}
      backAction={{ content: 'Products', onAction: () => navigate('/listings') }}
      primaryAction={{
        content: 'Run Pipeline',
        onAction: () => runPipelineMutation.mutate(),
        loading: runPipelineMutation.isPending,
      }}
      secondaryActions={[
        {
          content: 'Regenerate AI Description',
          onAction: () => aiMutation.mutate(),
          loading: aiMutation.isPending,
        },
      ]}
    >
      {productLoading && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <Spinner accessibilityLabel="Loading product" size="large" />
        </div>
      )}

      {product && (
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Pipeline progress</Text>
                  {pipelineJob?.status && <Badge>{pipelineJob.status}</Badge>}
                </InlineStack>
                {pipelineSteps.length === 0 ? (
                  <Text tone="subdued" as="p">No pipeline runs yet for this product.</Text>
                ) : (
                  <BlockStack gap="200">
                    {pipelineSteps.map((step: any) => (
                      <InlineStack key={step.name} align="space-between" blockAlign="center">
                        <Text as="span">{step.name.replace(/_/g, ' ')}</Text>
                        <Badge tone={step.status === 'done' ? 'success' : step.status === 'error' ? 'critical' : step.status === 'running' ? 'attention' : 'info'}>
                          {step.status}
                        </Badge>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* ── Phase 2: Photo Gallery ── */}
          <Layout.Section>
            <PhotoGallery
              images={galleryImages}
              loading={imagesLoading}
              viewMode={galleryViewMode}
              onViewModeChange={setGalleryViewMode}
              onSelectImage={handleSelectImage}
              selectedImageUrl={selectedImageUrl}
            />
          </Layout.Section>

          {/* ── Phase 2: Photo Reprocessing Controls ── */}
          <Layout.Section>
            <PhotoControls
              selectedImageUrl={selectedImageUrl}
              onReprocess={handleReprocess}
              onReprocessAll={handleReprocessAll}
              reprocessing={reprocessMutation.isPending}
              reprocessingAll={reprocessAllMutation.isPending}
              previewUrl={previewUrl}
              imageCount={images.length}
            />
          </Layout.Section>

          {/* ── Description ── */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">AI Description</Text>
                  <Button
                    icon={<Play className="w-4 h-4" />}
                    onClick={() => aiMutation.mutate()}
                    loading={aiMutation.isPending}
                  >
                    Regenerate with AI
                  </Button>
                </InlineStack>
                {aiDescription ? (
                  <BlockStack gap="200">
                    <Badge tone="success">AI-generated</Badge>
                    <div
                      style={{ maxHeight: '300px', overflow: 'auto', padding: '8px', background: '#fafafa', borderRadius: '6px', whiteSpace: 'pre-wrap' }}
                    >
                      {aiDescription}
                    </div>
                  </BlockStack>
                ) : product.body_html ? (
                  <div
                    style={{ maxHeight: '300px', overflow: 'auto', padding: '8px', background: '#fafafa', borderRadius: '6px' }}
                    dangerouslySetInnerHTML={{ __html: product.body_html }}
                  />
                ) : (
                  <Text tone="subdued" as="p">No AI description yet. Click "Regenerate with AI" to generate one.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* ── Product Details ── */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between">
                  <Text variant="headingMd" as="h2">Details</Text>
                  {statusBadge}
                </InlineStack>
                <Divider />
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">SKU</Text>
                  <Text variant="bodyMd" as="span">{variant?.sku ?? '—'}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">Price</Text>
                  <Text variant="bodyMd" as="span">{formatMoney(variant?.price ?? null)}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">Compare-at price</Text>
                  <Text variant="bodyMd" as="span">{formatMoney(variant?.compare_at_price ?? null)}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">Inventory</Text>
                  <Text variant="bodyMd" as="span">{variant?.inventory_quantity ?? '—'}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">Product type</Text>
                  <Text variant="bodyMd" as="span">{product.product_type || '—'}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">Vendor</Text>
                  <Text variant="bodyMd" as="span">{product.vendor || '—'}</Text>
                </InlineStack>
                <InlineStack align="space-between">
                  <Text variant="bodyMd" tone="subdued" as="span">Tags</Text>
                  <Text variant="bodyMd" as="span">{product.tags || '—'}</Text>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* ── eBay Link ── */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">eBay Listing</Text>
                <Divider />
                {listing?.ebayListingId ? (
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">eBay Item ID</Text>
                      <Text variant="bodyMd" as="span">{listing.ebayListingId}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Status</Text>
                      {listing.ebayListingId.startsWith('draft-') ? (
                        <Badge tone="info">Draft — not yet published</Badge>
                      ) : (
                        <Badge tone={listing.status === 'active' || listing.status === 'synced' ? 'success' : 'info'}>
                          {listing.status}
                        </Badge>
                      )}
                    </InlineStack>
                    <InlineStack gap="200">
                      {!listing.ebayListingId.startsWith('draft-') && (
                        <Button
                          icon={<ExternalLink className="w-4 h-4" />}
                          onClick={() => window.open(`https://www.ebay.com/itm/${listing.ebayListingId}`, '_blank')}
                        >
                          View on eBay
                        </Button>
                      )}
                      <Button onClick={() => navigate(`/ebay/listings/${listing.shopifyProductId}`)}>
                        Listing detail
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <Text tone="subdued" as="p">No eBay listing linked to this product.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      )}
    </Page>
  );
};

/* ──────────────────── ShopifyProducts (list) ──────────────────── */

const TAB_FILTERS = [
  { id: 'all', content: 'All' },
  { id: 'draft', content: 'Draft' },
  { id: 'active', content: 'Active' },
  { id: 'needs_description', content: 'Needs Description' },
  { id: 'needs_images', content: 'Needs Images' },
  { id: 'listed', content: 'On eBay' },
] as const;

const ShopifyProducts: React.FC = () => {
  const navigate = useNavigate();
  const { addNotification } = useAppStore();

  const [searchValue, setSearchValue] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, error } = useQuery({
    queryKey: ['products-overview'],
    queryFn: () => apiClient.get<ProductsOverviewResponse>('/products/overview'),
    refetchInterval: 30000,
  });

  const products = data?.products ?? [];

  // Pre-compute counts for tab badges
  const tabCounts = useMemo(() => {
    const nonArchived = products.filter((p) => (p.shopifyStatus ?? '').toLowerCase() !== 'archived');
    return {
      all: nonArchived.length,
      draft: nonArchived.filter((p) => (p.shopifyStatus ?? '').toLowerCase() === 'draft').length,
      active: nonArchived.filter((p) => (p.shopifyStatus ?? '').toLowerCase() === 'active').length,
      needs_description: nonArchived.filter((p) => !p.hasAiDescription).length,
      needs_images: nonArchived.filter((p) => !p.hasProcessedImages).length,
      listed: nonArchived.filter((p) => p.ebayStatus === 'listed' || p.ebayStatus === 'draft').length,
    };
  }, [products]);

  const tabs = TAB_FILTERS.map((tab) => ({
    ...tab,
    content: `${tab.content} (${tabCounts[tab.id]})`,
  }));

  const statusFilter = TAB_FILTERS[selectedTab]?.id ?? 'all';

  const filtered = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return products.filter((product) => {
      if ((product.shopifyStatus ?? '').toLowerCase() === 'archived') return false;

      const matchesQuery =
        !query ||
        product.title.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);

      if (!matchesQuery) return false;

      switch (statusFilter) {
        case 'draft':
          return (product.shopifyStatus ?? '').toLowerCase() === 'draft';
        case 'active':
          return (product.shopifyStatus ?? '').toLowerCase() === 'active';
        case 'needs_description':
          return !product.hasAiDescription;
        case 'needs_images':
          return !product.hasProcessedImages;
        case 'listed':
          return product.ebayStatus === 'listed' || product.ebayStatus === 'draft';
        default:
          return true;
      }
    });
  }, [products, searchValue, statusFilter]);

  // Always sort: drafts first, then active, then alphabetical
  const sorted = useMemo(() => {
    const rank = { draft: 0, active: 1 } as Record<string, number>;
    return [...filtered].sort((a, b) => {
      const ra = rank[(a.shopifyStatus ?? '').toLowerCase()] ?? 2;
      const rb = rank[(b.shopifyStatus ?? '').toLowerCase()] ?? 2;
      if (ra !== rb) return ra - rb;
      return a.title.localeCompare(b.title);
    });
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleTabChange = useCallback((index: number) => {
    setSelectedTab(index);
    setPage(1);
  }, []);

  const rowMarkup = pageItems.map((product, index) => (
    <IndexTable.Row
      id={product.shopifyProductId}
      key={product.shopifyProductId}
      position={index}
      onClick={() => navigate(`/listings/${product.shopifyProductId}`)}
    >
      <IndexTable.Cell>
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <Thumbnail
            size="extraSmall"
            source={product.imageUrl || PLACEHOLDER_IMG}
            alt={product.title}
          />
          <BlockStack gap="050">
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text as="span" variant="bodyMd" fontWeight="semibold">
                {product.title}
              </Text>
              {getShopifyStatusBadge(product.shopifyStatus)}
            </InlineStack>
            {product.sku && (
              <Text as="span" variant="bodySm" tone="subdued">{product.sku}</Text>
            )}
          </BlockStack>
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd">{formatMoney(product.price)}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusDot done={product.hasAiDescription} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <StatusDot done={product.hasProcessedImages} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        {getEbayBadge(product.ebayStatus)}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  const summary = data?.summary ?? {
    total: 0,
    withDescriptions: 0,
    withProcessedImages: 0,
    listedOnEbay: 0,
    draftOnEbay: 0,
  };

  return (
    <Page
      title="Products"
      subtitle={`${summary.total.toLocaleString()} products · ${summary.withDescriptions} descriptions · ${summary.withProcessedImages} images · ${summary.listedOnEbay + summary.draftOnEbay} on eBay`}
      fullWidth
    >
      <BlockStack gap="0">
        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />

          <Box padding="300">
            <TextField
              label=""
              placeholder="Search products…"
              value={searchValue}
              onChange={(value) => { setSearchValue(value); setPage(1); }}
              prefix={<Search className="w-4 h-4" />}
              clearButton
              onClearButtonClick={() => setSearchValue('')}
              autoComplete="off"
            />
          </Box>

          {error && (
            <Box padding="300">
              <Banner tone="critical" title="Unable to load products">
                <p>{error instanceof Error ? error.message : 'Something went wrong.'}</p>
              </Banner>
            </Box>
          )}

          {isLoading ? (
            <Box padding="800">
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading products" size="large" />
              </InlineStack>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: 'product', plural: 'products' }}
              itemCount={pageItems.length}
              selectable={false}
              headings={[
                { title: 'Product' },
                { title: 'Price' },
                { title: 'AI Desc' },
                { title: 'Images' },
                { title: 'eBay' },
              ]}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>

        <Box padding="400">
          <InlineStack align="center" gap="400">
            <Text tone="subdued" as="p">
              {sorted.length === 0
                ? 'No products match your filters'
                : `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, sorted.length)} of ${sorted.length}`}
            </Text>
            <Pagination
              hasPrevious={currentPage > 1}
              onPrevious={() => setPage((prev) => Math.max(1, prev - 1))}
              hasNext={currentPage < totalPages}
              onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            />
          </InlineStack>
        </Box>
      </BlockStack>
    </Page>
  );
};

export default ShopifyProducts;
