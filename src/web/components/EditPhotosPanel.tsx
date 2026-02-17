import React, { useState, useCallback, useEffect } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Collapsible,
  Divider,
  InlineStack,
  ProgressBar,
  Spinner,
  Text,
  Thumbnail,
} from '@shopify/polaris';
import { ChevronUp, ChevronDown, RefreshCw, RotateCcw } from 'lucide-react';
import PhotoControls, { type PhotoRoomParams } from './PhotoControls';

export interface EditablePhoto {
  id: number;
  originalUrl: string;
  alt: string | null;
  processing?: boolean;
  processed?: boolean;
  processedUrl?: string | null;
  error?: string | null;
}

interface EditPhotosPanelProps {
  photos: EditablePhoto[];
  selectedPhotoIds: number[];
  isOpen: boolean;
  onToggle: () => void;
  onProcessSingle: (photoId: number, params: PhotoRoomParams) => Promise<void>;
  onProcessSelected: (photoIds: number[], params: PhotoRoomParams) => Promise<void>;
  onProcessAll: (params: PhotoRoomParams) => Promise<void>;
  onRevertToOriginal?: (photoId: number) => Promise<void>;
  processing?: boolean;
}

const PLACEHOLDER_IMG =
  'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';

const EditPhotosPanel: React.FC<EditPhotosPanelProps> = ({
  photos,
  selectedPhotoIds,
  isOpen,
  onToggle,
  onProcessSingle,
  onProcessSelected,
  onProcessAll,
  onRevertToOriginal,
  processing = false,
}) => {
  const [params, setParams] = useState<PhotoRoomParams>({
    background: '#FFFFFF',
    padding: 0.1,
    shadow: true,
  });

  const selectedPhotos = photos.filter(p => selectedPhotoIds.includes(p.id));
  const hasSelection = selectedPhotoIds.length > 0;
  const allPhotosCount = photos.length;

  // Calculate processing progress
  const processingCount = photos.filter(p => p.processing).length;
  const processedCount = photos.filter(p => p.processed).length;
  const errorCount = photos.filter(p => p.error).length;

  const handleApplyToSelected = useCallback(async () => {
    if (selectedPhotoIds.length === 0) return;
    await onProcessSelected(selectedPhotoIds, params);
  }, [selectedPhotoIds, params, onProcessSelected]);

  const handleApplyToAll = useCallback(async () => {
    await onProcessAll(params);
  }, [params, onProcessAll]);

  // Show progress when any photos are processing
  const showProgress = processingCount > 0;
  const progressValue = showProgress ? 
    ((processedCount + errorCount) / (processedCount + errorCount + processingCount)) * 100 : 
    100;

  return (
    <Card>
      <BlockStack gap="400">
        {/* Header */}
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingMd" as="h2">
              Edit Photos with PhotoRoom
            </Text>
            {hasSelection && (
              <Badge tone="info">
                {`${selectedPhotoIds.length} selected`}
              </Badge>
            )}
          </InlineStack>
          <Button
            onClick={onToggle}
            icon={isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            variant="plain"
          >
            {isOpen ? 'Hide' : 'Show'} Editor
          </Button>
        </InlineStack>

        <Collapsible id="edit-photos-collapsible" open={isOpen}>
          <BlockStack gap="400">
            {/* Progress Bar */}
            {showProgress && (
              <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" as="span">
                      Processing {processingCount} photo{processingCount !== 1 ? 's' : ''}...
                    </Text>
                    <Text variant="bodySm" tone="subdued" as="span">
                      {processedCount + errorCount} / {processedCount + errorCount + processingCount}
                    </Text>
                  </InlineStack>
                  <ProgressBar progress={Math.round(progressValue)} />
                </BlockStack>
              </Box>
            )}

            {/* PhotoRoom Controls */}
            <PhotoControls
              selectedImageUrl={null} // Not used in bulk mode
              onReprocess={(_, params) => {
                // This shouldn't be called in bulk mode, but just in case
                setParams(params);
              }}
              onReprocessAll={(params) => setParams(params)}
              reprocessing={false}
              reprocessingAll={processing}
              imageCount={allPhotosCount}
              hideActionButtons={true} // We'll show our own buttons
            />

            {/* Custom Action Buttons */}
            <InlineStack gap="200" align="space-between">
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  Apply Processing:
                </Text>
                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    icon={<RefreshCw size={16} />}
                    onClick={handleApplyToAll}
                    loading={processing}
                    disabled={allPhotosCount === 0}
                  >
                    Apply to All Photos ({allPhotosCount.toString()})
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<RefreshCw size={16} />}
                    onClick={handleApplyToSelected}
                    loading={processing}
                    disabled={!hasSelection}
                  >
                    Apply to Selected ({selectedPhotoIds.length.toString()})
                  </Button>
                </InlineStack>
              </BlockStack>
            </InlineStack>

            <Divider />

            {/* Before/After Preview */}
            {photos.length > 0 && (
              <BlockStack gap="300">
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  Preview ({hasSelection ? selectedPhotos.length : photos.length} photo{(hasSelection ? selectedPhotos.length : photos.length) !== 1 ? 's' : ''}):
                </Text>
                
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '16px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                  }}
                >
                  {(hasSelection ? selectedPhotos : photos).map((photo) => (
                    <div key={photo.id}>
                      <Card padding="200">
                        <BlockStack gap="200">
                          {/* Before/After Images */}
                          <InlineStack gap="200" wrap={false}>
                            <div style={{ flex: 1 }}>
                              <Text variant="bodySm" tone="subdued" as="p">
                                Before
                              </Text>
                              <Thumbnail
                                size="small"
                                source={photo.originalUrl || PLACEHOLDER_IMG}
                                alt="Before processing"
                              />
                            </div>
                            <div style={{ flex: 1 }}>
                              <Text variant="bodySm" tone="subdued" as="p">
                                After
                              </Text>
                              {photo.processing ? (
                                <div
                                  style={{
                                    width: '80px',
                                    height: '80px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f3f4f6',
                                    borderRadius: '6px',
                                  }}
                                >
                                  <Spinner accessibilityLabel="Processing" size="small" />
                                </div>
                              ) : photo.processedUrl ? (
                                <Thumbnail
                                  size="small"
                                  source={photo.processedUrl}
                                  alt="After processing"
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '80px',
                                    height: '80px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f3f4f6',
                                    borderRadius: '6px',
                                    color: '#9ca3af',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                  }}
                                >
                                  Not processed
                                </div>
                              )}
                            </div>
                          </InlineStack>

                          {/* Status and Actions */}
                          <InlineStack align="space-between" blockAlign="center">
                            {photo.processing ? (
                              <Badge tone="warning">Processing...</Badge>
                            ) : photo.error ? (
                              <Badge tone="critical">Error</Badge>
                            ) : photo.processed ? (
                              <Badge tone="success">Processed</Badge>
                            ) : (
                              <Badge>Original</Badge>
                            )}

                            <InlineStack gap="100">
                              {photo.processed && photo.processedUrl && onRevertToOriginal && (
                                <Button
                                  size="slim"
                                  variant="plain"
                                  icon={<RotateCcw size={14} />}
                                  onClick={() => onRevertToOriginal(photo.id)}
                                >
                                  Revert
                                </Button>
                              )}
                            </InlineStack>
                          </InlineStack>

                          {/* Error Message */}
                          {photo.error && (
                            <Text variant="bodySm" tone="critical" as="p">
                              {photo.error}
                            </Text>
                          )}
                        </BlockStack>
                      </Card>
                    </div>
                  ))}
                </div>
              </BlockStack>
            )}

            {/* Usage Guidance */}
            {!hasSelection && allPhotosCount > 0 && (
              <Banner tone="info">
                <p>
                  <strong>Bulk editing mode:</strong> Controls will apply to ALL {allPhotosCount} photos. 
                  To edit specific photos, select them in the gallery above.
                </p>
              </Banner>
            )}

            {hasSelection && (
              <Banner tone="info">
                <p>
                  <strong>Selected photos mode:</strong> Controls will apply to the {selectedPhotoIds.length} selected photos. 
                  Use "Apply to All" to process every photo instead.
                </p>
              </Banner>
            )}
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
};

export default EditPhotosPanel;