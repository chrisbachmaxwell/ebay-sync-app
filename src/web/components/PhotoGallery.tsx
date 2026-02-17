import React, { useState, useCallback } from 'react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Spinner,
  Text,
} from '@shopify/polaris';
import { X, ZoomIn, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

export interface GalleryImage {
  id: number;
  position: number;
  originalUrl: string;
  alt: string | null;
  processedUrl: string | null;
  processingStatus: 'original' | 'processing' | 'completed' | 'error';
  params: { background?: string; padding?: number; shadow?: boolean } | null;
  processedAt: number | null;
}

interface PhotoGalleryProps {
  images: GalleryImage[];
  loading?: boolean;
  viewMode: 'side-by-side' | 'toggle';
  onViewModeChange: (mode: 'side-by-side' | 'toggle') => void;
  onSelectImage?: (image: GalleryImage) => void;
  selectedImageUrl?: string | null;
  onEditImage?: (imageUrl: string) => void;
}

const PLACEHOLDER_IMG =
  'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png';

const statusConfig: Record<
  string,
  { tone: 'success' | 'info' | 'warning' | 'critical'; label: string }
> = {
  original: { tone: 'info', label: 'Original' },
  processing: { tone: 'warning', label: 'Processing…' },
  completed: { tone: 'success', label: 'Processed' },
  error: { tone: 'critical', label: 'Error' },
};

/* ── Lightbox ────────────────────────────────────────────────────────── */

const Lightbox: React.FC<{
  images: GalleryImage[];
  currentIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  showProcessed: boolean;
}> = ({ images, currentIndex, onClose, onPrev, onNext, showProcessed }) => {
  const img = images[currentIndex];
  if (!img) return null;
  const src = showProcessed && img.processedUrl ? img.processedUrl : img.originalUrl;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: '50%',
          padding: 8,
          cursor: 'pointer',
          color: '#fff',
          zIndex: 10,
        }}
      >
        <X size={24} />
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          style={{
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            padding: 12,
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Image */}
      <img
        src={src}
        alt={img.alt ?? 'Product image'}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: 8,
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          style={{
            position: 'absolute',
            right: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '50%',
            padding: 12,
            cursor: 'pointer',
            color: '#fff',
          }}
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Counter */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#fff',
          fontSize: 14,
          opacity: 0.7,
        }}
      >
        {currentIndex + 1} / {images.length}
        {showProcessed && img.processedUrl && ' (Processed)'}
        {(!showProcessed || !img.processedUrl) && ' (Original)'}
      </div>
    </div>
  );
};

/* ── Image Thumbnail Card ────────────────────────────────────────────── */

const ImageCard: React.FC<{
  image: GalleryImage;
  viewMode: 'side-by-side' | 'toggle';
  showProcessed: boolean;
  onToggle: () => void;
  onOpenLightbox: () => void;
  onSelect?: () => void;
  isSelected?: boolean;
  onEdit?: (imageUrl: string) => void;
}> = ({ image, viewMode, showProcessed, onToggle, onOpenLightbox, onSelect, isSelected, onEdit }) => {
  const status = statusConfig[image.processingStatus] ?? statusConfig.original;
  const [isHovered, setIsHovered] = useState(false);

  const imgStyle: React.CSSProperties = {
    width: '100%',
    height: 160,
    objectFit: 'cover',
    borderRadius: 6,
    cursor: 'pointer',
    border: isSelected ? '2px solid #2563eb' : '2px solid transparent',
  };

  const ImageWithOverlay: React.FC<{ src: string; alt: string; onClick?: () => void }> = ({ src, alt, onClick }) => (
    <div 
      style={{ position: 'relative' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img
        src={src || PLACEHOLDER_IMG}
        alt={alt}
        style={{ ...imgStyle, height: 140 }}
        onClick={onClick}
      />
      {isHovered && onEdit && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onEdit(image.originalUrl);
          }}
        >
          <Button size="slim" variant="primary">
            Edit with PhotoRoom
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div
      style={{
        width: viewMode === 'side-by-side' ? 320 : 180,
        flexShrink: 0,
      }}
    >
      <Card padding="200">
        <BlockStack gap="200">
          {/* Status badge */}
          <InlineStack align="space-between" blockAlign="center">
            <Badge tone={status.tone}>{status.label}</Badge>
            <button
              onClick={onOpenLightbox}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                color: '#6b7280',
              }}
              title="View full size"
            >
              <ZoomIn size={16} />
            </button>
          </InlineStack>

          {viewMode === 'side-by-side' ? (
            <InlineStack gap="200" wrap={false}>
              <div style={{ flex: 1 }}>
                <Text variant="bodySm" tone="subdued" as="p">
                  Original
                </Text>
                <ImageWithOverlay
                  src={image.originalUrl}
                  alt="Original"
                  onClick={onSelect}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Text variant="bodySm" tone="subdued" as="p">
                  Processed
                </Text>
                {image.processedUrl ? (
                  <ImageWithOverlay
                    src={image.processedUrl}
                    alt="Processed"
                    onClick={onOpenLightbox}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: 140,
                      borderRadius: 6,
                      background: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ImageIcon size={24} color="#9ca3af" />
                  </div>
                )}
              </div>
            </InlineStack>
          ) : (
            <div>
              <ImageWithOverlay
                src={
                  showProcessed && image.processedUrl
                    ? image.processedUrl
                    : image.originalUrl
                }
                alt={image.alt ?? 'Product image'}
                onClick={onSelect}
              />
              {image.processedUrl && (
                <Box paddingBlockStart="100">
                  <Button size="micro" onClick={onToggle} variant="plain">
                    {showProcessed ? 'Show original' : 'Show processed'}
                  </Button>
                </Box>
              )}
            </div>
          )}
        </BlockStack>
      </Card>
    </div>
  );
};

/* ── Main Gallery ────────────────────────────────────────────────────── */

const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  images,
  loading,
  viewMode,
  onViewModeChange,
  onSelectImage,
  selectedImageUrl,
  onEditImage,
}) => {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [toggleStates, setToggleStates] = useState<Record<number, boolean>>({});

  const handleToggle = useCallback((id: number) => {
    setToggleStates((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
  }, []);

  if (loading) {
    return (
      <Card>
        <Box padding="600">
          <InlineStack align="center">
            <Spinner accessibilityLabel="Loading images" size="large" />
          </InlineStack>
        </Box>
      </Card>
    );
  }

  if (images.length === 0) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="200" inlineAlign="center">
            <ImageIcon size={48} color="#9ca3af" />
            <Text tone="subdued" as="p" alignment="center">
              No images found for this product.
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  const processedCount = images.filter((i) => i.processedUrl).length;

  return (
    <>
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">
                Photo Gallery
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                {images.length} image{images.length !== 1 ? 's' : ''} · {processedCount} processed
              </Text>
            </BlockStack>

            <InlineStack gap="200">
              <Button
                size="slim"
                variant={viewMode === 'side-by-side' ? 'primary' : 'secondary'}
                onClick={() => onViewModeChange('side-by-side')}
              >
                Side by side
              </Button>
              <Button
                size="slim"
                variant={viewMode === 'toggle' ? 'primary' : 'secondary'}
                onClick={() => onViewModeChange('toggle')}
              >
                Toggle
              </Button>
            </InlineStack>
          </InlineStack>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            {images.map((img, index) => (
              <ImageCard
                key={img.id}
                image={img}
                viewMode={viewMode}
                showProcessed={toggleStates[img.id] ?? true}
                onToggle={() => handleToggle(img.id)}
                onOpenLightbox={() => openLightbox(index)}
                onSelect={() => onSelectImage?.(img)}
                isSelected={selectedImageUrl === img.originalUrl}
                onEdit={onEditImage}
              />
            ))}
          </div>
        </BlockStack>
      </Card>

      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          showProcessed={toggleStates[images[lightboxIndex]?.id] ?? true}
          onClose={() => setLightboxIndex(null)}
          onPrev={() =>
            setLightboxIndex((prev) =>
              prev !== null ? (prev - 1 + images.length) % images.length : 0,
            )
          }
          onNext={() =>
            setLightboxIndex((prev) =>
              prev !== null ? (prev + 1) % images.length : 0,
            )
          }
        />
      )}
    </>
  );
};

export default PhotoGallery;
