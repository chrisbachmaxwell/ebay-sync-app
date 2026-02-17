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
  ExternalSmallIcon,
} from '@shopify/polaris-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, useListings } from '../hooks/useApi';
import { useAppStore } from '../store';
import PhotoGallery, { type GalleryImage } from '../components/PhotoGallery';
import PhotoControls, { type PhotoRoomParams } from '../components/PhotoControls';
import ActivePhotosGallery, { type ActivePhoto } from '../components/ActivePhotosGallery';
import EditPhotosPanel, { type EditablePhoto } from '../components/EditPhotosPanel';
import TemplateManager from '../components/TemplateManager';
import InlineDraftApproval from '../components/InlineDraftApproval';

/* ── Simple markdown → HTML for AI description preview ── */
function mdInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
function markdownToHtml(md: string): string {
  // Strip unwanted labels from AI output
  const cleaned = md
    .replace(/^\*\*Title line:\*\*\s*/gm, '')
    .replace(/^Title line:\s*/gm, '')
    .replace(/^\*\*Intro:\*\*\s*/gm, '')
    .replace(/^Intro:\s*/gm, '');
  
  const lines = cleaned.split('\n');
  const html: string[] = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { if (inList) { html.push('</ul>'); inList = false; } continue; }
    if (trimmed.startsWith('### ')) { if (inList) { html.push('</ul>'); inList = false; } html.push(`<h3>${mdInline(trimmed.slice(4))}</h3>`); continue; }
    if (trimmed.startsWith('## ')) { if (inList) { html.push('</ul>'); inList = false; } html.push(`<h2>${mdInline(trimmed.slice(3))}</h2>`); continue; }
    if (trimmed.startsWith('# ')) { if (inList) { html.push('</ul>'); inList = false; } html.push(`<h1>${mdInline(trimmed.slice(2))}</h1>`); continue; }
    const bullet = trimmed.match(/^[-*✔✅☑●•►▸]\s*(.+)/);
    if (bullet) { if (!inList) { html.push('<ul>'); inList = true; } html.push(`<li>${mdInline(bullet[1])}</li>`); continue; }
    if (inList) { html.push('</ul>'); inList = false; }
    html.push(`<p>${mdInline(trimmed)}</p>`);
  }
  if (inList) html.push('</ul>');
  return html.join('\n');
}

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
  const [showPhotoControls, setShowPhotoControls] = useState(false);
  const [showEditHtml, setShowEditHtml] = useState(false);
  
  // New photo management state
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [processingPhotos, setProcessingPhotos] = useState<Set<number>>(new Set());

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

  // ── Fetch current Shopify images (active photos) ──
  const { data: activePhotosData, isLoading: activePhotosLoading } = useQuery({
    queryKey: ['active-photos', id],
    queryFn: async () => {
      // Fetch from product info to get current Shopify images
      const productData = await apiClient.get<{ ok: boolean; product?: any }>(`/test/product-info/${id}`);
      const images = productData?.product?.images || [];
      return images.map((img: any) => ({
        id: img.id,
        position: img.position,
        src: img.src,
        alt: img.alt,
      }));
    },
    enabled: Boolean(id),
    refetchInterval: 10000,
  });

  const activePhotos: ActivePhoto[] = activePhotosData ?? [];

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

  // Transform active photos into editable photos for the edit panel
  const editablePhotos: EditablePhoto[] = activePhotos.map(photo => {
    const galleryMatch = galleryImages.find(img => img.originalUrl === photo.src);
    return {
      id: photo.id,
      originalUrl: photo.src,
      alt: photo.alt,
      processing: processingPhotos.has(photo.id),
      processed: !!galleryMatch?.processedUrl,
      processedUrl: galleryMatch?.processedUrl,
    };
  });

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
      queryClient.invalidateQueries({ queryKey: ['product-pipeline-status', id] });
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

  const handleImageEditClick = useCallback((imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setShowPhotoControls(true);
  }, []);

  // ── Delete mutations ──
  const deleteSingleImageMutation = useMutation({
    mutationFn: (imageId: number) =>
      apiClient.delete(`/products/${id}/images/${imageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-photos', id] });
      queryClient.invalidateQueries({ queryKey: ['product-images', id] });
      addNotification({ type: 'success', title: 'Image deleted', autoClose: 3000 });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Delete failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  const deleteBulkImagesMutation = useMutation({
    mutationFn: (imageIds: number[]) =>
      apiClient.delete(`/products/${id}/images`, { imageIds }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['active-photos', id] });
      queryClient.invalidateQueries({ queryKey: ['product-images', id] });
      setSelectedPhotoIds([]);
      const succeeded = data?.succeeded || 0;
      const failed = data?.failed || 0;
      addNotification({ 
        type: 'success', 
        title: `Deleted ${succeeded} image${succeeded !== 1 ? 's' : ''}${failed > 0 ? `, ${failed} failed` : ''}`, 
        autoClose: 4000 
      });
    },
    onError: (error) => {
      addNotification({
        type: 'error',
        title: 'Bulk delete failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });

  // ── Photo processing functions ──
  const handleProcessSinglePhoto = useCallback(async (photoId: number, params: PhotoRoomParams) => {
    const photo = activePhotos.find(p => p.id === photoId);
    if (!photo) return;

    setProcessingPhotos(prev => new Set(prev).add(photoId));
    
    try {
      await apiClient.post(`/products/${id}/images/reprocess`, {
        imageUrl: photo.src,
        ...params,
      });
      queryClient.invalidateQueries({ queryKey: ['product-images', id] });
      addNotification({ type: 'success', title: 'Photo processed', autoClose: 3000 });
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setProcessingPhotos(prev => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
    }
  }, [activePhotos, id, queryClient, addNotification]);

  const handleProcessSelectedPhotos = useCallback(async (photoIds: number[], params: PhotoRoomParams) => {
    setProcessingPhotos(prev => new Set([...prev, ...photoIds]));
    
    let successCount = 0;
    let errorCount = 0;

    for (const photoId of photoIds) {
      const photo = activePhotos.find(p => p.id === photoId);
      if (!photo) continue;

      try {
        await apiClient.post(`/products/${id}/images/reprocess`, {
          imageUrl: photo.src,
          ...params,
        });
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    setProcessingPhotos(prev => {
      const next = new Set(prev);
      photoIds.forEach(id => next.delete(id));
      return next;
    });

    queryClient.invalidateQueries({ queryKey: ['product-images', id] });
    
    if (successCount > 0 && errorCount === 0) {
      addNotification({ 
        type: 'success', 
        title: `Processed ${successCount} photo${successCount !== 1 ? 's' : ''}`, 
        autoClose: 3000 
      });
    } else if (successCount > 0) {
      addNotification({ 
        type: 'warning', 
        title: `Processed ${successCount}, ${errorCount} failed`, 
        autoClose: 4000 
      });
    } else {
      addNotification({ 
        type: 'error', 
        title: `Failed to process ${errorCount} photo${errorCount !== 1 ? 's' : ''}`, 
        autoClose: 4000 
      });
    }
  }, [activePhotos, id, queryClient, addNotification]);

  const handleProcessAllPhotos = useCallback(async (params: PhotoRoomParams) => {
    try {
      const result = await reprocessAllMutation.mutateAsync(params);
      addNotification({
        type: 'success',
        title: 'All photos processed',
        message: `${result?.succeeded ?? 0} succeeded, ${result?.failed ?? 0} failed`,
        autoClose: 4000,
      });
    } catch (error) {
      // Error handling is already in the mutation
    }
  }, [reprocessAllMutation, addNotification]);

  // ── Edit panel handlers ──
  const handleEditPhotos = useCallback((photoIds: number[]) => {
    setSelectedPhotoIds(photoIds);
    setEditPanelOpen(true);
  }, []);

  const handleDeleteSingle = useCallback((imageId: number) => {
    deleteSingleImageMutation.mutate(imageId);
  }, [deleteSingleImageMutation]);

  const handleDeleteBulk = useCallback((imageIds: number[]) => {
    deleteBulkImagesMutation.mutate(imageIds);
  }, [deleteBulkImagesMutation]);

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
      secondaryActions={
        product
          ? [
              {
                content: 'View in Shopify',
                icon: ExternalSmallIcon,
                url: `https://admin.shopify.com/store/usedcameragear/products/${id}`,
                external: true,
              },
            ]
          : undefined
      }
    >
      {productLoading && (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <Spinner accessibilityLabel="Loading product" size="large" />
        </div>
      )}

      {product && (
        <>
          {/* ── Inline Draft Approval Banner ── */}
          <InlineDraftApproval productId={id!} />

          <Layout>
            {/* ── LEFT COLUMN (2/3) ── */}
            <Layout.Section>
              {/* ── Active Photos Gallery ── */}
            <ActivePhotosGallery
              photos={activePhotos}
              loading={activePhotosLoading}
              onDeleteSingle={handleDeleteSingle}
              onDeleteBulk={handleDeleteBulk}
              onEditPhotos={handleEditPhotos}
              onSelectionChange={setSelectedPhotoIds}
            />

            {/* ── Edit Photos Panel ── */}
            <EditPhotosPanel
              photos={editablePhotos}
              selectedPhotoIds={selectedPhotoIds}
              isOpen={editPanelOpen}
              onToggle={() => setEditPanelOpen(prev => !prev)}
              onProcessSingle={handleProcessSinglePhoto}
              onProcessSelected={handleProcessSelectedPhotos}
              onProcessAll={handleProcessAllPhotos}
              processing={reprocessAllMutation.isPending || processingPhotos.size > 0}
            />

            {/* ── Legacy Photo Gallery (for comparison/debugging) ── */}
            {process.env.NODE_ENV === 'development' && (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Legacy Gallery (Dev Only)</Text>
                    <InlineStack gap="200" blockAlign="center">
                      {galleryImages.length > 0 && (
                        <Badge tone="info">{`${galleryImages.length} images`}</Badge>
                      )}
                      <Button
                        onClick={() => handleReprocessAll({ background: '#ffffff', padding: 0.1, shadow: false })}
                        loading={reprocessAllMutation.isPending}
                      >
                        Reprocess All
                      </Button>
                    </InlineStack>
                  </InlineStack>

                  {imagesLoading ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <Spinner accessibilityLabel="Loading images" />
                    </div>
                  ) : galleryImages.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <Text tone="subdued" as="p">No images found for this product</Text>
                    </div>
                  ) : (
                    <PhotoGallery
                      images={galleryImages}
                      loading={imagesLoading}
                      viewMode={galleryViewMode}
                      onViewModeChange={setGalleryViewMode}
                      onSelectImage={handleSelectImage}
                      selectedImageUrl={selectedImageUrl}
                      onEditImage={handleImageEditClick}
                    />
                  )}
                </BlockStack>
              </Card>
            )}

              {/* ── Description Section ── */}
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Description</Text>
                    <Button
                      icon={<Play className="w-4 h-4" />}
                      onClick={() => aiMutation.mutate()}
                      loading={aiMutation.isPending}
                    >
                      Regenerate with AI
                    </Button>
                  </InlineStack>

                  {aiDescription ? (
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Badge tone="success">AI-generated description available</Badge>
                        <Button
                          onClick={() => {
                            // TODO: Implement "Use This" functionality
                            addNotification({ 
                              type: 'info', 
                              title: 'Feature coming soon', 
                              message: 'AI description integration will be implemented next',
                              autoClose: 3000 
                            });
                          }}
                        >
                          Use This
                        </Button>
                      </InlineStack>
                      <div
                        style={{ 
                          maxHeight: '300px', 
                          overflow: 'auto', 
                          padding: '12px', 
                          background: '#f8f9fa', 
                          borderRadius: '8px',
                          border: '1px solid #e1e3e5',
                        }}
                        dangerouslySetInnerHTML={{ __html: markdownToHtml(aiDescription) }}
                      />
                    </BlockStack>
                  ) : null}

                  {/* Current Description */}
                  {product.body_html ? (
                    <BlockStack gap="300">
                      <Text variant="bodyMd" tone="subdued" as="p">Current description:</Text>
                      <div
                        style={{ 
                          maxHeight: '300px', 
                          overflow: 'auto', 
                          padding: '12px', 
                          background: '#fafbfb', 
                          borderRadius: '8px',
                          border: '1px solid #e1e3e5'
                        }}
                        dangerouslySetInnerHTML={{ __html: product.body_html }}
                      />
                      
                      <Button
                        variant="plain"
                        onClick={() => setShowEditHtml(!showEditHtml)}
                      >
                        {showEditHtml ? 'Hide HTML source' : 'View HTML source'}
                      </Button>
                      
                      {showEditHtml && (
                        <div
                          style={{ 
                            maxHeight: '200px', 
                            overflow: 'auto', 
                            padding: '12px', 
                            background: '#f1f1f1', 
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            fontFamily: 'monospace',
                            fontSize: '12px'
                          }}
                        >
                          {product.body_html}
                        </div>
                      )}
                    </BlockStack>
                  ) : (
                    <Text tone="subdued" as="p">No description yet. Use AI to generate one.</Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>

            {/* ── RIGHT SIDEBAR (1/3) ── */}
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                
                {/* ── Product Status & Details ── */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Product Details</Text>
                      {statusBadge}
                    </InlineStack>
                    <Divider />
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Price</Text>
                      <Text variant="bodyMd" as="span">{formatMoney(variant?.price ?? null)}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Compare-at price</Text>
                      <Text variant="bodyMd" as="span">{formatMoney(variant?.compare_at_price ?? null)}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">SKU</Text>
                      <Text variant="bodyMd" as="span">{variant?.sku ?? '—'}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Barcode</Text>
                      <Text variant="bodyMd" as="span">{variant?.barcode ?? '—'}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Inventory</Text>
                      <Text variant="bodyMd" as="span">{variant?.inventory_quantity ?? '—'}</Text>
                    </InlineStack>
                    <Divider />
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Vendor</Text>
                      <Text variant="bodyMd" as="span">{product.vendor ?? '—'}</Text>
                    </InlineStack>
                    <InlineStack align="space-between">
                      <Text variant="bodyMd" tone="subdued" as="span">Product type</Text>
                      <Text variant="bodyMd" as="span">{product.product_type ?? '—'}</Text>
                    </InlineStack>
                    {product.tags && (
                      <>
                        <Text variant="bodyMd" tone="subdued" as="span">Tags</Text>
                        <InlineStack gap="100" wrap>
                          {(typeof product.tags === 'string' ? product.tags.split(',') : product.tags).map((tag: string) => (
                            <Badge key={tag.trim()}>{tag.trim()}</Badge>
                          ))}
                        </InlineStack>
                      </>
                    )}
                  </BlockStack>
                </Card>

                {/* ── eBay Listing Status ── */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">eBay Listing</Text>
                    <Divider />
                    {listing?.ebayListingId ? (
                      <BlockStack gap="300">
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
                        <InlineStack align="space-between">
                          <Text variant="bodyMd" tone="subdued" as="span">eBay Item ID</Text>
                          <Text variant="bodyMd" as="span">{listing.ebayListingId}</Text>
                        </InlineStack>
                        <ButtonGroup>
                          {!listing.ebayListingId.startsWith('draft-') && (
                            <Button
                              size="slim"
                              icon={<ExternalLink className="w-4 h-4" />}
                              url={`https://www.ebay.com/itm/${listing.ebayListingId}`}
                              external
                            >
                              View on eBay
                            </Button>
                          )}
                          <Button
                            size="slim"
                            onClick={() => navigate(`/ebay/listings/${listing.shopifyProductId}`)}
                          >
                            Listing Detail
                          </Button>
                        </ButtonGroup>
                      </BlockStack>
                    ) : (
                      <Text tone="subdued" as="p">Not listed on eBay yet.</Text>
                    )}
                  </BlockStack>
                </Card>

                {/* ── Pipeline Status ── */}
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingMd" as="h2">Pipeline Status</Text>
                      {pipelineJob?.status && <Badge>{pipelineJob.status}</Badge>}
                    </InlineStack>
                    <Divider />
                    {pipelineSteps.length === 0 ? (
                      <Text tone="subdued" as="p">No pipeline runs yet.</Text>
                    ) : (
                      <BlockStack gap="200">
                        {pipelineSteps.map((step: any) => (
                          <InlineStack key={step.name} align="space-between" blockAlign="center">
                            <Text as="span" variant="bodySm">{step.name.replace(/_/g, ' ')}</Text>
                            <Badge 
                              tone={
                                step.status === 'done' ? 'success' : 
                                step.status === 'error' ? 'critical' : 
                                step.status === 'running' ? 'attention' : 'info'
                              }
                              size="small"
                            >
                              {step.status}
                            </Badge>
                          </InlineStack>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>

                {/* ── Quick Actions ── */}
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h2">Quick Actions</Text>
                    <Divider />
                    <ButtonGroup fullWidth>
                      <Button
                        size="slim"
                        icon={<ExternalLink className="w-4 h-4" />}
                        url={`https://admin.shopify.com/store/usedcameragear/products/${id}`}
                        external
                      >
                        View in Shopify
                      </Button>
                    </ButtonGroup>
                  </BlockStack>
                </Card>

              </BlockStack>
            </Layout.Section>
          </Layout>

          {/* ── Photo Controls Modal/Panel ── */}
          {showPhotoControls && (
            <div style={{ marginTop: '1rem' }}>
              <PhotoControls
                selectedImageUrl={selectedImageUrl}
                onReprocess={handleReprocess}
                onReprocessAll={handleReprocessAll}
                reprocessing={reprocessMutation.isPending}
                reprocessingAll={reprocessAllMutation.isPending}
                previewUrl={previewUrl}
                imageCount={images.length}
              />
            </div>
          )}

          {/* ── Templates Section ── */}
          <div style={{ marginTop: '1rem' }}>
            <TemplateManager
              productId={id}
              onApplied={() => {
                queryClient.invalidateQueries({ queryKey: ['product-images', id] });
              }}
            />
          </div>
        </>
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
  const [selectedTab, setSelectedTab] = useState<number>(0);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading, error } = useQuery({
    queryKey: ['products-overview'],
    queryFn: () => apiClient.get<ProductsOverviewResponse>('/products/overview'),
    refetchInterval: 30000,
  });

  const products = useMemo(() => data?.products ?? [], [data?.products]);

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

  const tabs = useMemo(() => TAB_FILTERS.map((tab) => ({
    ...tab,
    content: `${tab.content} (${tabCounts[tab.id]})`,
  })), [tabCounts]);

  const statusFilter = useMemo(() => {
    return TAB_FILTERS[selectedTab]?.id ?? 'all';
  }, [selectedTab]);

  const filtered = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    const result = products.filter((product) => {
      // Exclude archived products
      if ((product.shopifyStatus ?? '').toLowerCase() === 'archived') return false;

      // Search query filter
      const matchesQuery =
        !query ||
        product.title.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query);

      if (!matchesQuery) return false;

      // Status filter
      const productStatus = (product.shopifyStatus ?? '').toLowerCase();
      
      switch (statusFilter) {
        case 'draft':
          return productStatus === 'draft';
        case 'active':
          return productStatus === 'active';
        case 'needs_description':
          return !product.hasAiDescription;
        case 'needs_images':
          return !product.hasProcessedImages;
        case 'listed':
          return product.ebayStatus === 'listed' || product.ebayStatus === 'draft';
        case 'all':
        default:
          return true;
      }
    });

    return result;
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
    if (index >= 0 && index < TAB_FILTERS.length) {
      setSelectedTab(index);
      setPage(1);
    }
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
          <Tabs 
            tabs={tabs} 
            selected={selectedTab} 
            onSelect={handleTabChange}
          />

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
