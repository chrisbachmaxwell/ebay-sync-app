import React, { useState, useCallback, useEffect } from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  ButtonGroup,
  Card,
  Divider,
  InlineStack,
  RangeSlider,
  Text,
  TextField,
} from '@shopify/polaris';
import { Image as ImageIcon, RefreshCw, Palette, Layers } from 'lucide-react';

export interface PhotoRoomParams {
  background: string; // hex color with #
  padding: number; // 0 – 0.5
  shadow: boolean;
}

interface PhotoControlsProps {
  /** Currently selected image URL for single reprocess */
  selectedImageUrl: string | null;
  /** Callback when user clicks "Reprocess" (single image) */
  onReprocess: (imageUrl: string, params: PhotoRoomParams) => void;
  /** Callback when user clicks "Reprocess All" */
  onReprocessAll: (params: PhotoRoomParams) => void;
  /** Callback when parameters change (real-time updates) */
  onParamsChange?: (params: PhotoRoomParams) => void;
  /** Whether a single reprocess is in progress */
  reprocessing?: boolean;
  /** Whether a bulk reprocess is in progress */
  reprocessingAll?: boolean;
  /** Preview URL to show after processing */
  previewUrl?: string | null;
  /** Total image count for the "Reprocess All" button */
  imageCount?: number;
  /** Hide the action buttons (for use in EditPhotosPanel) */
  hideActionButtons?: boolean;
}

/* ── Color presets ──────────────────────────────────────────────────── */

const COLOR_PRESETS = [
  { hex: '#FFFFFF', label: 'White' },
  { hex: '#F5F5F5', label: 'Light Gray' },
  { hex: '#000000', label: 'Black' },
  { hex: '#E8F0FE', label: 'Light Blue' },
  { hex: '#FFF9E6', label: 'Cream' },
  { hex: '#F0F0F0', label: 'Silver' },
];

/* ── Main Component ─────────────────────────────────────────────────── */

const PhotoControls: React.FC<PhotoControlsProps> = ({
  selectedImageUrl,
  onReprocess,
  onReprocessAll,
  onParamsChange,
  reprocessing,
  reprocessingAll,
  previewUrl,
  imageCount = 0,
  hideActionButtons = false,
}) => {
  const [background, setBackground] = useState('#FFFFFF');
  const [padding, setPadding] = useState(10); // percentage 0-50
  const [shadow, setShadow] = useState(true);
  const [customColor, setCustomColor] = useState('');

  // Build params from state
  const getParams = useCallback((): PhotoRoomParams => {
    return {
      background,
      padding: padding / 100, // convert % to 0-0.5 ratio
      shadow,
    };
  }, [background, padding, shadow]);

  // Notify parent about parameter changes
  useEffect(() => {
    if (onParamsChange) {
      onParamsChange(getParams());
    }
  }, [onParamsChange, getParams]);

  const handleReprocess = useCallback(() => {
    if (selectedImageUrl) {
      onReprocess(selectedImageUrl, getParams());
    }
  }, [selectedImageUrl, onReprocess, getParams]);

  const handleReprocessAll = useCallback(() => {
    onReprocessAll(getParams());
  }, [onReprocessAll, getParams]);

  const handleCustomColorApply = useCallback(() => {
    const hex = customColor.startsWith('#') ? customColor : `#${customColor}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setBackground(hex);
      setCustomColor('');
    }
  }, [customColor]);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="050">
            <Text variant="headingMd" as="h2">
              Reprocessing Controls
            </Text>
            <Text variant="bodySm" tone="subdued" as="p">
              Adjust PhotoRoom settings and reprocess images
            </Text>
          </BlockStack>
          <Badge tone="info">PhotoRoom</Badge>
        </InlineStack>

        <Divider />

        {/* ── Background Color ──────────────────────────────────────── */}
        <BlockStack gap="200">
          <InlineStack gap="100" blockAlign="center">
            <Palette size={16} color="#6b7280" />
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              Background Color
            </Text>
          </InlineStack>

          <InlineStack gap="200" wrap>
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                onClick={() => setBackground(preset.hex)}
                title={preset.label}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border:
                    background === preset.hex
                      ? '2px solid #2563eb'
                      : '2px solid #e5e7eb',
                  backgroundColor: preset.hex,
                  cursor: 'pointer',
                  padding: 0,
                  position: 'relative',
                }}
              >
                {background === preset.hex && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: preset.hex === '#000000' ? '#fff' : '#2563eb',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    ✓
                  </span>
                )}
              </button>
            ))}
          </InlineStack>

          <InlineStack gap="200" blockAlign="end">
            <div style={{ flex: 1, maxWidth: 160 }}>
              <TextField
                label=""
                placeholder="#AABBCC"
                value={customColor}
                onChange={setCustomColor}
                autoComplete="off"
                connectedRight={
                  <Button size="slim" onClick={handleCustomColorApply}>
                    Apply
                  </Button>
                }
              />
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '2px solid #e5e7eb',
                backgroundColor: background,
              }}
            />
            <Text variant="bodySm" tone="subdued" as="span">
              {background}
            </Text>
          </InlineStack>
        </BlockStack>

        <Divider />

        {/* ── Padding ──────────────────────────────────────────────── */}
        <BlockStack gap="200">
          <InlineStack gap="100" blockAlign="center">
            <Layers size={16} color="#6b7280" />
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              Padding / White Space
            </Text>
            <Text variant="bodySm" tone="subdued" as="span">
              {padding}%
            </Text>
          </InlineStack>

          <RangeSlider
            label=""
            value={padding}
            min={0}
            max={50}
            step={1}
            onChange={(val) => setPadding(typeof val === 'number' ? val : val[0])}
            output
          />

          <InlineStack gap="200">
            {[0, 5, 10, 20, 30].map((val) => (
              <Button
                key={val}
                size="slim"
                variant={padding === val ? 'primary' : 'secondary'}
                onClick={() => setPadding(val)}
              >
                {`${val}%`}
              </Button>
            ))}
          </InlineStack>
        </BlockStack>

        <Divider />

        {/* ── Shadow ───────────────────────────────────────────────── */}
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <InlineStack gap="100" blockAlign="center">
              <ImageIcon size={16} color="#6b7280" />
              <Text variant="bodyMd" fontWeight="semibold" as="span">
                Drop Shadow
              </Text>
            </InlineStack>

            <button
              onClick={() => setShadow(!shadow)}
              style={{
                position: 'relative',
                width: 44,
                height: 24,
                borderRadius: 12,
                border: 'none',
                backgroundColor: shadow ? '#2563eb' : '#d1d5db',
                cursor: 'pointer',
                transition: 'background-color 200ms',
                padding: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  left: shadow ? 22 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  backgroundColor: '#fff',
                  transition: 'left 200ms',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </InlineStack>
          <Text variant="bodySm" tone="subdued" as="p">
            {shadow
              ? 'AI soft shadow enabled — adds a natural drop shadow under the product'
              : 'Shadow disabled — clean cutout on solid background'}
          </Text>
        </BlockStack>

        <Divider />

        {/* ── Preview ──────────────────────────────────────────────── */}
        {previewUrl && (
          <BlockStack gap="200">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              Preview
            </Text>
            <div
              style={{
                background: '#f9fafb',
                borderRadius: 8,
                padding: 8,
                textAlign: 'center',
              }}
            >
              <img
                src={previewUrl}
                alt="Processing preview"
                style={{
                  maxWidth: '100%',
                  maxHeight: 240,
                  objectFit: 'contain',
                  borderRadius: 6,
                }}
              />
            </div>
            <Divider />
          </BlockStack>
        )}

        {/* ── Settings summary ─────────────────────────────────────── */}
        <Box padding="200" background="bg-surface-secondary" borderRadius="200">
          <InlineStack gap="300" wrap>
            <InlineStack gap="100">
              <Text variant="bodySm" tone="subdued" as="span">BG:</Text>
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                  backgroundColor: background,
                  display: 'inline-block',
                }}
              />
              <Text variant="bodySm" as="span">{background}</Text>
            </InlineStack>
            <InlineStack gap="100">
              <Text variant="bodySm" tone="subdued" as="span">Padding:</Text>
              <Text variant="bodySm" as="span">{padding}%</Text>
            </InlineStack>
            <InlineStack gap="100">
              <Text variant="bodySm" tone="subdued" as="span">Shadow:</Text>
              <Badge tone={shadow ? 'success' : undefined}>
                {shadow ? 'On' : 'Off'}
              </Badge>
            </InlineStack>
          </InlineStack>
        </Box>

        {/* ── Action buttons ───────────────────────────────────────── */}
        {!hideActionButtons && (
          <>
            <InlineStack gap="200">
              <Button
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={handleReprocess}
                loading={reprocessing}
                disabled={!selectedImageUrl || reprocessingAll}
              >
                {selectedImageUrl ? 'Reprocess Image' : 'Select an image first'}
              </Button>

              <Button
                icon={<RefreshCw size={16} />}
                onClick={handleReprocessAll}
                loading={reprocessingAll}
                disabled={imageCount === 0 || reprocessing}
              >
                {`Reprocess All (${imageCount})`}
              </Button>
            </InlineStack>

            {!selectedImageUrl && (
              <Banner tone="info">
                <p>Click an image in the gallery above to select it for individual reprocessing.</p>
              </Banner>
            )}
          </>
        )}
      </BlockStack>
    </Card>
  );
};

export default PhotoControls;
