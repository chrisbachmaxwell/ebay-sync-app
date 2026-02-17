import React, { useState, useEffect } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Checkbox,
  TextField,
  Divider,
  Badge,
  Spinner,
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../hooks/useApi';

interface AutoPublishSettingsData {
  perType: Array<{ product_type: string; enabled: boolean }>;
  global: {
    autoPublishNoPhotos: boolean;
    autoPublishNoDescription: boolean;
  };
}

const AutoPublishSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const [newProductType, setNewProductType] = useState('');
  const [localGlobal, setLocalGlobal] = useState({
    autoPublishNoPhotos: false,
    autoPublishNoDescription: false,
  });
  const [localPerType, setLocalPerType] = useState<Array<{ product_type: string; enabled: boolean }>>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['draft-settings'],
    queryFn: () => apiClient.get<AutoPublishSettingsData>('/drafts/settings'),
  });

  useEffect(() => {
    if (settings) {
      setLocalGlobal(settings.global);
      setLocalPerType(settings.perType);
      setHasChanges(false);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: { perType: typeof localPerType; global: typeof localGlobal }) =>
      apiClient.put('/drafts/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draft-settings'] });
      setHasChanges(false);
    },
  });

  const handleGlobalChange = (key: keyof typeof localGlobal) => (newValue: boolean) => {
    setLocalGlobal((prev) => ({ ...prev, [key]: newValue }));
    setHasChanges(true);
  };

  const handleTypeToggle = (productType: string) => {
    setLocalPerType((prev) =>
      prev.map((item) =>
        item.product_type === productType ? { ...item, enabled: !item.enabled } : item,
      ),
    );
    setHasChanges(true);
  };

  const handleAddType = () => {
    const trimmed = newProductType.trim();
    if (!trimmed) return;
    if (localPerType.some((t) => t.product_type === trimmed)) return;
    setLocalPerType((prev) => [...prev, { product_type: trimmed, enabled: true }]);
    setNewProductType('');
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ perType: localPerType, global: localGlobal });
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <Spinner size="large" />
        </div>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Banner tone="warning">
        <p>
          <strong>Active products with existing content always require manual review.</strong>{' '}
          Auto-publish only applies to products that have <em>no</em> existing photos or descriptions on Shopify.
          This ensures live product data is never overwritten without human approval.
        </p>
      </Banner>

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Global Auto-Publish Rules</Text>
          <Text variant="bodySm" as="p" tone="subdued">
            These rules determine when processed content is automatically published
            without requiring manual review.
          </Text>

          <Divider />

          <Checkbox
            label="Auto-publish when product has no existing photos"
            helpText="When enabled, products with no Shopify photos will have draft images published automatically."
            checked={localGlobal.autoPublishNoPhotos}
            onChange={handleGlobalChange('autoPublishNoPhotos')}
          />

          <Checkbox
            label="Auto-publish when product has no existing description"
            helpText="When enabled, products with no Shopify description will have AI descriptions published automatically."
            checked={localGlobal.autoPublishNoDescription}
            onChange={handleGlobalChange('autoPublishNoDescription')}
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Per Product Type Settings</Text>
          <Text variant="bodySm" as="p" tone="subdued">
            Enable auto-publish for specific product types. Only products with no existing content
            will be auto-published.
          </Text>

          <Divider />

          {localPerType.length === 0 ? (
            <Text as="p" tone="subdued">
              No product type rules configured. Add one below.
            </Text>
          ) : (
            <BlockStack gap="200">
              {localPerType.map((item) => (
                <InlineStack key={item.product_type} align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Checkbox
                      label=""
                      checked={item.enabled}
                      onChange={() => handleTypeToggle(item.product_type)}
                    />
                    <Text variant="bodyMd" as="span">{item.product_type}</Text>
                  </InlineStack>
                  <Badge tone={item.enabled ? 'success' : undefined}>
                    {item.enabled ? 'Auto-publish' : 'Manual review'}
                  </Badge>
                </InlineStack>
              ))}
            </BlockStack>
          )}

          <Divider />

          <InlineStack gap="200" blockAlign="end">
            <div style={{ flex: 1 }}>
              <TextField
                label="Add product type"
                labelHidden
                value={newProductType}
                onChange={setNewProductType}
                placeholder="e.g. Camera, Lens, Flash"
                autoComplete="off"
              />
            </div>
            <Button onClick={handleAddType} disabled={!newProductType.trim()}>
              Add
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>

      {hasChanges && (
        <div style={{ position: 'sticky', bottom: 0, padding: '1rem 0' }}>
          <Banner tone="info">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span">You have unsaved changes.</Text>
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saveMutation.isPending}
              >
                Save Settings
              </Button>
            </InlineStack>
          </Banner>
        </div>
      )}
    </BlockStack>
  );
};

export default AutoPublishSettings;
