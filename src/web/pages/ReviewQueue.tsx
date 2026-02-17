import React, { useState, useCallback } from 'react';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Badge,
  Button,
  ButtonGroup,
  Thumbnail,
  Text,
  Filters,
  ChoiceList,
  Modal,
  Banner,
  BlockStack,
  InlineStack,
  Divider,
  Box,
  Spinner,
  EmptyState,
  Tabs,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../hooks/useApi';
import AutoPublishSettings from '../components/AutoPublishSettings';

// ── Types ──────────────────────────────────────────────────────────────

interface Draft {
  id: number;
  shopify_product_id: string;
  draft_title: string | null;
  draft_description: string | null;
  draft_images_json: string | null;
  original_title: string | null;
  original_description: string | null;
  original_images_json: string | null;
  status: string;
  auto_publish: number;
  created_at: number;
  updated_at: number;
  reviewed_at: number | null;
  reviewed_by: string | null;
  draftImages: string[];
  originalImages: string[];
}

interface DraftListResponse {
  data: Draft[];
  total: number;
  limit: number;
  offset: number;
  pendingCount: number;
}

interface DraftDetailResponse {
  draft: Draft;
  live: {
    title: string;
    description: string;
    images: string[];
    hasPhotos: boolean;
    hasDescription: boolean;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <Badge tone="attention">Pending Review</Badge>;
    case 'approved':
      return <Badge tone="success">Approved</Badge>;
    case 'rejected':
      return <Badge tone="critical">Rejected</Badge>;
    case 'partial':
      return <Badge tone="warning">Partially Approved</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

const formatDate = (unix: number) => {
  return new Date(unix * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const truncateHtml = (html: string, maxLen = 200) => {
  const text = html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ');
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
};

// ── Main Component ─────────────────────────────────────────────────────

const ReviewQueue: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string[]>(['pending']);
  const [page, setPage] = useState(0);
  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);
  const [bulkApproveModalOpen, setBulkApproveModalOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const limit = 20;

  const tabs = [
    { id: 'queue', content: 'Review Queue' },
    { id: 'settings', content: 'Auto-Publish Settings' },
  ];

  const statusValue = statusFilter[0] || 'pending';

  // ── Queries ────────────────────────────────────────────────────────

  const { data: draftsData, isLoading } = useQuery({
    queryKey: ['drafts', statusValue, page],
    queryFn: () =>
      apiClient.get<DraftListResponse>(
        `/drafts?status=${statusValue}&limit=${limit}&offset=${page * limit}`,
      ),
    refetchInterval: 10000,
  });

  const { data: draftCount } = useQuery({
    queryKey: ['drafts-count'],
    queryFn: () => apiClient.get<{ count: number }>('/drafts/count'),
    refetchInterval: 10000,
  });

  const { data: draftDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['draft-detail', expandedDraft],
    queryFn: () =>
      expandedDraft ? apiClient.get<DraftDetailResponse>(`/drafts/${expandedDraft}`) : null,
    enabled: expandedDraft !== null,
  });

  // ── Mutations ──────────────────────────────────────────────────────

  const approveMutation = useMutation({
    mutationFn: ({ id, photos, description }: { id: number; photos: boolean; description: boolean }) =>
      apiClient.post(`/drafts/${id}/approve`, { photos, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts-count'] });
      queryClient.invalidateQueries({ queryKey: ['draft-detail'] });
      setExpandedDraft(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/drafts/${id}/reject`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts-count'] });
      setExpandedDraft(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, title, description }: { id: number; title?: string; description?: string }) =>
      apiClient.put(`/drafts/${id}`, { title, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['draft-detail'] });
      setEditingDraft(null);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () => apiClient.post('/drafts/approve-all', { photos: true, description: true, confirm: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      queryClient.invalidateQueries({ queryKey: ['drafts-count'] });
      setBulkApproveModalOpen(false);
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────

  const handleApprove = useCallback((id: number, photos: boolean, description: boolean) => {
    approveMutation.mutate({ id, photos, description });
  }, [approveMutation]);

  const handleReject = useCallback((id: number) => {
    rejectMutation.mutate(id);
  }, [rejectMutation]);

  const handleStartEdit = useCallback((draft: Draft) => {
    setEditingDraft(draft.id);
    setEditTitle(draft.draft_title || '');
    setEditDescription(draft.draft_description || '');
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingDraft) {
      updateMutation.mutate({ id: editingDraft, title: editTitle, description: editDescription });
    }
  }, [editingDraft, editTitle, editDescription, updateMutation]);

  // ── Draft Detail Modal ─────────────────────────────────────────────

  const renderDraftDetail = () => {
    if (!expandedDraft || !draftDetail) return null;

    const { draft, live } = draftDetail;
    const isEditing = editingDraft === draft.id;

    return (
      <Modal
        open={expandedDraft !== null}
        onClose={() => { setExpandedDraft(null); setEditingDraft(null); }}
        title={`Review: ${draft.draft_title || draft.original_title || `Product #${draft.shopify_product_id}`}`}
        size="large"
        primaryAction={
          draft.status === 'pending'
            ? {
                content: 'Approve All',
                onAction: () => handleApprove(draft.id, true, true),
                loading: approveMutation.isPending,
              }
            : undefined
        }
        secondaryActions={
          draft.status === 'pending'
            ? [
                {
                  content: 'Approve Photos Only',
                  onAction: () => handleApprove(draft.id, true, false),
                },
                {
                  content: 'Approve Description Only',
                  onAction: () => handleApprove(draft.id, false, true),
                },
                {
                  content: 'Reject',
                  destructive: true,
                  onAction: () => handleReject(draft.id),
                  loading: rejectMutation.isPending,
                },
              ]
            : []
        }
      >
        <Modal.Section>
          {detailLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Spinner size="large" />
            </div>
          ) : (
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h3">Status</Text>
                {statusBadge(draft.status)}
              </InlineStack>

              <Text variant="bodySm" as="p" tone="subdued">
                Created: {formatDate(draft.created_at)}
                {draft.reviewed_at && ` • Reviewed: ${formatDate(draft.reviewed_at)}`}
              </Text>

              <Divider />

              {/* Side-by-side comparison: Description */}
              <Text variant="headingMd" as="h3">Description Comparison</Text>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Current (Live)</Text>
                    <div
                      style={{
                        maxHeight: '300px',
                        overflow: 'auto',
                        fontSize: '13px',
                        lineHeight: 1.5,
                        color: '#666',
                      }}
                    >
                      {live.description ? (
                        <div dangerouslySetInnerHTML={{ __html: live.description }} />
                      ) : (
                        <Text as="p" tone="subdued"><em>No description</em></Text>
                      )}
                    </div>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text variant="headingSm" as="h4">Proposed (Draft)</Text>
                      {draft.status === 'pending' && !isEditing && (
                        <Button size="slim" onClick={() => handleStartEdit(draft)}>Edit</Button>
                      )}
                    </InlineStack>
                    {isEditing ? (
                      <BlockStack gap="200">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="Title"
                          style={{ width: '100%', padding: '8px', fontSize: '14px', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          rows={8}
                          style={{ width: '100%', padding: '8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #ccc' }}
                        />
                        <ButtonGroup>
                          <Button onClick={handleSaveEdit} loading={updateMutation.isPending} variant="primary">
                            Save
                          </Button>
                          <Button onClick={() => setEditingDraft(null)}>Cancel</Button>
                        </ButtonGroup>
                      </BlockStack>
                    ) : (
                      <div
                        style={{
                          maxHeight: '300px',
                          overflow: 'auto',
                          fontSize: '13px',
                          lineHeight: 1.5,
                        }}
                      >
                        {draft.draft_description ? (
                          <div dangerouslySetInnerHTML={{ __html: draft.draft_description }} />
                        ) : (
                          <Text as="p" tone="subdued"><em>No description in draft</em></Text>
                        )}
                      </div>
                    )}
                  </BlockStack>
                </Card>
              </div>

              <Divider />

              {/* Side-by-side comparison: Images */}
              <Text variant="headingMd" as="h3">Image Comparison</Text>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Current Photos ({live.images.length})</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {live.images.length > 0 ? (
                        live.images.map((img, i) => (
                          <Thumbnail key={i} source={img} alt={`Current ${i + 1}`} size="large" />
                        ))
                      ) : (
                        <Text as="p" tone="subdued"><em>No photos</em></Text>
                      )}
                    </div>
                  </BlockStack>
                </Card>
                <Card>
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">Proposed Photos ({draft.draftImages.length})</Text>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {draft.draftImages.length > 0 ? (
                        draft.draftImages.map((img, i) => (
                          <Thumbnail
                            key={i}
                            source={img.startsWith('http') ? img : '/api/placeholder-image'}
                            alt={`Proposed ${i + 1}`}
                            size="large"
                          />
                        ))
                      ) : (
                        <Text as="p" tone="subdued"><em>No photos in draft</em></Text>
                      )}
                    </div>
                  </BlockStack>
                </Card>
              </div>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>
    );
  };

  // ── Bulk Approve Modal ─────────────────────────────────────────────

  const renderBulkApproveModal = () => (
    <Modal
      open={bulkApproveModalOpen}
      onClose={() => setBulkApproveModalOpen(false)}
      title="Bulk Approve All Pending Drafts"
      primaryAction={{
        content: `Approve All ${draftCount?.count || 0} Drafts`,
        onAction: () => bulkApproveMutation.mutate(),
        loading: bulkApproveMutation.isPending,
        destructive: false,
      }}
      secondaryActions={[
        { content: 'Cancel', onAction: () => setBulkApproveModalOpen(false) },
      ]}
    >
      <Modal.Section>
        <Banner tone="warning">
          <p>
            This will approve <strong>{draftCount?.count || 0}</strong> pending drafts and push their
            content (photos + descriptions) to Shopify. This action cannot be undone.
          </p>
        </Banner>
      </Modal.Section>
    </Modal>
  );

  // ── Main Render ────────────────────────────────────────────────────

  const drafts = draftsData?.data || [];
  const total = draftsData?.total || 0;
  const pendingCount = draftCount?.count || 0;

  return (
    <Page
      title="Review Queue"
      subtitle={`${pendingCount} drafts awaiting review`}
      primaryAction={
        pendingCount > 0
          ? {
              content: `Approve All (${pendingCount})`,
              onAction: () => setBulkApproveModalOpen(true),
            }
          : undefined
      }
    >
      <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
        {selectedTab === 0 ? (
          <Layout>
            <Layout.Section>
              <Card padding="0">
                <div style={{ padding: '16px 16px 0' }}>
                  <Filters
                    queryValue=""
                    onQueryChange={() => {}}
                    onQueryClear={() => {}}
                    onClearAll={() => setStatusFilter(['pending'])}
                    filters={[
                      {
                        key: 'status',
                        label: 'Status',
                        filter: (
                          <ChoiceList
                            title="Status"
                            titleHidden
                            choices={[
                              { label: 'Pending', value: 'pending' },
                              { label: 'Approved', value: 'approved' },
                              { label: 'Rejected', value: 'rejected' },
                              { label: 'Partial', value: 'partial' },
                              { label: 'All', value: 'all' },
                            ]}
                            selected={statusFilter}
                            onChange={(value) => {
                              setStatusFilter(value);
                              setPage(0);
                            }}
                          />
                        ),
                        shortcut: true,
                      },
                    ]}
                    appliedFilters={
                      statusFilter[0] !== 'pending'
                        ? [
                            {
                              key: 'status',
                              label: `Status: ${statusFilter[0]}`,
                              onRemove: () => setStatusFilter(['pending']),
                            },
                          ]
                        : []
                    }
                    hideQueryField
                  />
                </div>

                {isLoading ? (
                  <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <Spinner size="large" />
                  </div>
                ) : drafts.length === 0 ? (
                  <EmptyState
                    heading="No drafts found"
                    image=""
                  >
                    <p>
                      {statusValue === 'pending'
                        ? 'All caught up! No drafts awaiting review.'
                        : `No ${statusValue} drafts.`}
                    </p>
                  </EmptyState>
                ) : (
                  <ResourceList
                    resourceName={{ singular: 'draft', plural: 'drafts' }}
                    items={drafts}
                    renderItem={(draft: Draft) => {
                      const thumbnail = draft.draftImages?.[0];
                      const media = thumbnail && thumbnail.startsWith('http') ? (
                        <Thumbnail source={thumbnail} alt={draft.draft_title || ''} size="medium" />
                      ) : (
                        <Thumbnail source="" alt="" size="medium" />
                      );

                      return (
                        <ResourceItem
                          id={String(draft.id)}
                          media={media}
                          onClick={() => setExpandedDraft(draft.id)}
                          accessibilityLabel={`Review draft ${draft.draft_title || draft.shopify_product_id}`}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="bold" as="span">
                                {draft.draft_title || draft.original_title || `Product #${draft.shopify_product_id}`}
                              </Text>
                              <Text variant="bodySm" as="span" tone="subdued">
                                {draft.draftImages.length} photos •{' '}
                                {draft.draft_description
                                  ? `${truncateHtml(draft.draft_description, 80)}`
                                  : 'No description'}
                              </Text>
                              <Text variant="bodySm" as="span" tone="subdued">
                                {formatDate(draft.created_at)}
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200">
                              {statusBadge(draft.status)}
                              {draft.status === 'pending' && (
                                <ButtonGroup>
                                  <Button
                                    size="slim"
                                    variant="primary"
                                    onClick={() => {
                                      handleApprove(draft.id, true, true);
                                    }}
                                  >
                                    Approve
                                  </Button>
                                  <Button
                                    size="slim"
                                    tone="critical"
                                    onClick={() => {
                                      handleReject(draft.id);
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </ButtonGroup>
                              )}
                            </InlineStack>
                          </InlineStack>
                        </ResourceItem>
                      );
                    }}
                  />
                )}
              </Card>

              {/* Pagination */}
              {total > limit && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem', gap: '0.5rem' }}>
                  <Button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Text variant="bodySm" as="span" tone="subdued">
                    Page {page + 1} of {Math.ceil(total / limit)}
                  </Text>
                  <Button
                    disabled={(page + 1) * limit >= total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </Layout.Section>
          </Layout>
        ) : (
          <Layout>
            <Layout.Section>
              <AutoPublishSettings />
            </Layout.Section>
          </Layout>
        )}
      </Tabs>

      {renderDraftDetail()}
      {renderBulkApproveModal()}
    </Page>
  );
};

export default ReviewQueue;
