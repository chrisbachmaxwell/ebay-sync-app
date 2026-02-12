import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Page,
  Card,
  Tabs,
  Select,
  TextField,
  Button,
  ButtonGroup,
  Banner,
  Modal,
  IndexTable,
  Badge,
  Text,
  Icon,
  Tooltip,
  SkeletonBodyText,
  EmptyState,
  Checkbox,
  Box,
  InlineStack,
  BlockStack,
  Divider,
  Spinner,
  Toast,
  Frame,
  Link
} from '@shopify/polaris';
import {
  ArrowRightIcon,
  ImportIcon,
  ExportIcon,
  SearchIcon,
  EditIcon,
  SaveIcon,
  ResetIcon
} from '@shopify/polaris-icons';
import { useMappings, useUpdateMapping, useBulkUpdateMappings, AttributeMapping } from '../hooks/useApi';
import { useAppStore } from '../store';

// Available Shopify field options
const SHOPIFY_FIELD_OPTIONS = [
  { label: '— Select a field —', value: '', group: '' },
  
  // Product Fields
  { label: 'Product Title', value: 'title', group: 'Product Fields' },
  { label: 'Description', value: 'body_html', group: 'Product Fields' },
  { label: 'Vendor/Brand', value: 'vendor', group: 'Product Fields' },
  { label: 'Product Type', value: 'product_type', group: 'Product Fields' },
  { label: 'Tags', value: 'tags', group: 'Product Fields' },
  { label: 'URL Handle', value: 'handle', group: 'Product Fields' },
  { label: 'Status', value: 'status', group: 'Product Fields' },
  
  // Variant Fields
  { label: 'SKU', value: 'variants[0].sku', group: 'Variant Fields' },
  { label: 'Barcode/UPC', value: 'variants[0].barcode', group: 'Variant Fields' },
  { label: 'Price', value: 'variants[0].price', group: 'Variant Fields' },
  { label: 'Compare at Price', value: 'variants[0].compare_at_price', group: 'Variant Fields' },
  { label: 'Weight', value: 'variants[0].weight', group: 'Variant Fields' },
  { label: 'Weight Unit', value: 'variants[0].weight_unit', group: 'Variant Fields' },
  { label: 'Inventory Quantity', value: 'variants[0].inventory_quantity', group: 'Variant Fields' },
  { label: 'Taxable', value: 'variants[0].taxable', group: 'Variant Fields' },
  
  // Metafields
  { label: 'Condition', value: 'metafields.condition', group: 'Metafields' },
  { label: 'Brand', value: 'metafields.brand', group: 'Metafields' },
  
  // Images
  { label: 'Main Image URL', value: 'images[0].src', group: 'Images' },
  { label: 'Featured Image', value: 'image.src', group: 'Images' }
];

const MAPPING_TYPE_OPTIONS = [
  { label: 'Use Shopify field', value: 'shopify_field' },
  { label: 'Set constant value', value: 'constant' },
  { label: 'Edit per product', value: 'edit_in_grid' },
  { label: 'Custom formula', value: 'formula' }
];

// Required fields by category
const REQUIRED_FIELDS = {
  sales: ['sku', 'price'],
  listing: ['title', 'description', 'condition', 'category'],
  payment: ['accepted_payments'],
  shipping: ['shipping_cost', 'handling_time']
};

interface MappingRowProps {
  mapping: AttributeMapping;
  onUpdate: (updates: Partial<AttributeMapping>) => void;
  isRequired: boolean;
}

const MappingRow: React.FC<MappingRowProps> = ({ mapping, onUpdate, isRequired }) => {
  const [localUpdates, setLocalUpdates] = useState<Partial<AttributeMapping>>({});
  
  const handleMappingTypeChange = useCallback((value: string) => {
    const updates: Partial<AttributeMapping> = {
      mapping_type: value as AttributeMapping['mapping_type'],
      source_value: value === 'shopify_field' ? '' : null,
      target_value: value === 'constant' ? '' : null
    };
    setLocalUpdates(updates);
    onUpdate(updates);
  }, [onUpdate]);
  
  const handleSourceValueChange = useCallback((value: string) => {
    const updates = { source_value: value };
    setLocalUpdates(prev => ({ ...prev, ...updates }));
    onUpdate(updates);
  }, [onUpdate]);
  
  const handleTargetValueChange = useCallback((value: string) => {
    const updates = { target_value: value };
    setLocalUpdates(prev => ({ ...prev, ...updates }));
    onUpdate(updates);
  }, [onUpdate]);
  
  const handleToggleChange = useCallback((checked: boolean) => {
    const updates = { is_enabled: checked };
    setLocalUpdates(prev => ({ ...prev, ...updates }));
    onUpdate(updates);
  }, [onUpdate]);
  
  const currentMapping = { ...mapping, ...localUpdates };
  
  const renderMappingInput = () => {
    switch (currentMapping.mapping_type) {
      case 'shopify_field':
        return (
          <Select
            label=""
            options={SHOPIFY_FIELD_OPTIONS}
            value={currentMapping.source_value || ''}
            onChange={handleSourceValueChange}
            placeholder="Select Shopify field"
          />
        );
      case 'constant':
        return (
          <TextField
            label=""
            value={currentMapping.target_value || ''}
            onChange={handleTargetValueChange}
            placeholder="Enter constant value"
            autoComplete="off"
          />
        );
      case 'formula':
        return (
          <TextField
            label=""
            value={currentMapping.target_value || ''}
            onChange={handleTargetValueChange}
            placeholder="e.g., {{title}} - {{sku}}"
            autoComplete="off"
            helpText="Use {{field_name}} for dynamic values"
          />
        );
      case 'edit_in_grid':
        return (
          <Text as="p" tone="subdued">
            Will be edited in the product grid
          </Text>
        );
      default:
        return null;
    }
  };
  
  return (
    <IndexTable.Row
      id={mapping.field_name}
      position={mapping.display_order}
    >
      <IndexTable.Cell>
        <InlineStack gap="200" align="start">
          <Text variant="bodyMd" fontWeight="semibold" as="span">
            {mapping.field_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Text>
          {isRequired && (
            <Badge tone="critical" size="small">Required</Badge>
          )}
        </InlineStack>
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Icon source={ArrowRightIcon} tone="subdued" />
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Select
          label=""
          options={MAPPING_TYPE_OPTIONS}
          value={currentMapping.mapping_type}
          onChange={handleMappingTypeChange}
        />
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Box minWidth="200px">
          {renderMappingInput()}
        </Box>
      </IndexTable.Cell>
      
      <IndexTable.Cell>
        <Checkbox
          label=""
          checked={currentMapping.is_enabled}
          onChange={handleToggleChange}
        />
      </IndexTable.Cell>
    </IndexTable.Row>
  );
};

const Mappings: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [searchValue, setSearchValue] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  const { data: mappingsData, isLoading, error, refetch } = useMappings();
  const updateMapping = useUpdateMapping();
  const bulkUpdateMappings = useBulkUpdateMappings();
  
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, Partial<AttributeMapping>>>(new Map());
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  
  // Debounced save function
  useEffect(() => {
    if (pendingUpdates.size === 0) return;
    
    const timeoutId = setTimeout(() => {
      // Auto-save changes
      const updates = Array.from(pendingUpdates.entries());
      updates.forEach(([key, changes]) => {
        const [category, fieldName] = key.split(':');
        updateMapping.mutate({ category, fieldName, updates: changes });
      });
      
      setPendingUpdates(new Map());
      setLastSaveTime(new Date());
      setHasUnsavedChanges(false);
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [pendingUpdates, updateMapping]);
  
  const categories = useMemo(() => ['sales', 'listing', 'payment', 'shipping'], []);
  
  const tabs = useMemo(() => categories.map((category, index) => {
    const categoryMappings = mappingsData?.[category as keyof typeof mappingsData] || [];
    const disabledCount = categoryMappings.filter(m => !m.is_enabled).length;
    const requiredFields = REQUIRED_FIELDS[category as keyof typeof REQUIRED_FIELDS] || [];
    const unmappedRequired = requiredFields.filter(field => 
      !categoryMappings.find(m => m.field_name === field && m.is_enabled && (m.source_value || m.target_value))
    ).length;
    
    return {
      id: category,
      content: `${category.charAt(0).toUpperCase() + category.slice(1)}${
        (disabledCount > 0 || unmappedRequired > 0) ? 
        ` (${unmappedRequired > 0 ? `${unmappedRequired} unmapped` : `${disabledCount} disabled`})` : 
        ''
      }`,
      accessibilityLabel: `${category} mappings`,
    };
  }), [mappingsData, categories]);
  
  const currentCategory = categories[selectedTab];
  const currentMappings = useMemo(() => {
    if (!mappingsData || !currentCategory) return [];
    const categoryMappings = mappingsData[currentCategory as keyof typeof mappingsData] || [];
    
    if (!searchValue) return categoryMappings;
    
    return categoryMappings.filter(mapping =>
      mapping.field_name.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [mappingsData, currentCategory, searchValue]);
  
  const handleMappingUpdate = useCallback((mapping: AttributeMapping, updates: Partial<AttributeMapping>) => {
    const key = `${mapping.category}:${mapping.field_name}`;
    setPendingUpdates(prev => {
      const newUpdates = new Map(prev);
      if (Object.keys(updates).length > 0) {
        newUpdates.set(key, { ...newUpdates.get(key), ...updates });
        setHasUnsavedChanges(true);
      } else {
        newUpdates.delete(key);
      }
      return newUpdates;
    });
  }, []);
  
  const handleBulkSave = useCallback(() => {
    if (pendingUpdates.size === 0) return;
    
    const updates = Array.from(pendingUpdates.entries());
    updates.forEach(([key, changes]) => {
      const [category, fieldName] = key.split(':');
      updateMapping.mutate({ category, fieldName, updates: changes });
    });
    
    setPendingUpdates(new Map());
    setHasUnsavedChanges(false);
  }, [pendingUpdates, updateMapping]);
  
  const handleExport = async () => {
    try {
      const response = await fetch('/api/mappings/export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mappings-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      setExportModalOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };
  
  const handleImport = async () => {
    if (!importFile) return;
    
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      
      const response = await fetch('/api/mappings/import', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        setImportModalOpen(false);
        setImportFile(null);
        refetch();
      }
    } catch (err) {
      console.error('Import failed:', err);
    }
  };
  
  if (isLoading) {
    return (
      <Page title="Field Mappings" fullWidth>
        <Card>
          <SkeletonBodyText lines={10} />
        </Card>
      </Page>
    );
  }
  
  if (error) {
    return (
      <Page title="Field Mappings" fullWidth>
        <Banner tone="critical">
          <p>Failed to load mappings: {(error as Error).message}</p>
          <Box paddingBlockStart="200">
            <Button onClick={() => refetch()}>Try Again</Button>
          </Box>
        </Banner>
      </Page>
    );
  }
  
  if (!mappingsData) {
    return (
      <Page title="Field Mappings" fullWidth>
        <Card>
          <EmptyState
            heading="No mappings configured"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Configure field mappings between Shopify and eBay to start syncing products.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }
  
  return (
    <Frame>
      <Page
        title="Field Mappings"
        subtitle="Configure how Shopify fields map to eBay fields"
        fullWidth
        primaryAction={
          <ButtonGroup>
            {hasUnsavedChanges && (
              <Button
                variant="primary"
                onClick={handleBulkSave}
                loading={updateMapping.isPending}
                icon={SaveIcon}
              >
                Save Changes
              </Button>
            )}
            <Button
              icon={ExportIcon}
              onClick={() => setExportModalOpen(true)}
            >
              Export
            </Button>
          </ButtonGroup>
        }
        secondaryActions={[
          {
            content: 'Import',
            icon: ImportIcon,
            onAction: () => setImportModalOpen(true)
          }
        ]}
      >
        {hasUnsavedChanges && (
          <Banner tone="info">
            <InlineStack gap="200" align="space-between">
              <Text as="p">You have unsaved changes. They will be automatically saved in a moment.</Text>
              <Button size="micro" onClick={handleBulkSave}>Save Now</Button>
            </InlineStack>
          </Banner>
        )}
        
        {lastSaveTime && (
          <Toast
            content={`Changes saved at ${lastSaveTime.toLocaleTimeString()}`}
            onDismiss={() => setLastSaveTime(null)}
            duration={3000}
          />
        )}
        
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" align="space-between">
              <div style={{ width: '300px' }}>
                <TextField
                  label=""
                  value={searchValue}
                  onChange={setSearchValue}
                  placeholder="Search fields..."
                  prefix={<Icon source={SearchIcon} />}
                  clearButton
                  onClearButtonClick={() => setSearchValue('')}
                  autoComplete="off"
                />
              </div>
              
              <InlineStack gap="200">
                <Text as="p" tone="subdued">
                  {pendingUpdates.size > 0 && `${pendingUpdates.size} unsaved changes`}
                </Text>
              </InlineStack>
            </InlineStack>
            
            <Divider />
            
            <Tabs
              tabs={tabs}
              selected={selectedTab}
              onSelect={setSelectedTab}
            >
              <Box paddingBlockStart="400">
                <Card>
                  <BlockStack gap="300">
                    <InlineStack gap="400" align="space-between">
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h3">
                          {currentCategory?.charAt(0).toUpperCase() + currentCategory?.slice(1)} Fields
                        </Text>
                        <Text as="p" tone="subdued">
                          {currentMappings.length} field{currentMappings.length !== 1 ? 's' : ''} configured
                        </Text>
                      </BlockStack>
                    </InlineStack>
                    
                    <IndexTable
                      resourceName={{
                        singular: 'mapping',
                        plural: 'mappings'
                      }}
                      itemCount={currentMappings.length}
                      headings={[
                        { title: 'Field Name' },
                        { title: '' },
                        { title: 'Mapping Type' },
                        { title: 'Configuration' },
                        { title: 'Enabled' }
                      ]}
                      selectable={false}
                    >
                      {currentMappings.map((mapping) => {
                        const requiredFields = REQUIRED_FIELDS[mapping.category as keyof typeof REQUIRED_FIELDS] || [];
                        const isRequired = requiredFields.includes(mapping.field_name);
                        
                        return (
                          <MappingRow
                            key={`${mapping.category}-${mapping.field_name}`}
                            mapping={mapping}
                            onUpdate={(updates) => handleMappingUpdate(mapping, updates)}
                            isRequired={isRequired}
                          />
                        );
                      })}
                    </IndexTable>
                  </BlockStack>
                </Card>
              </Box>
            </Tabs>
          </BlockStack>
        </Card>
        
        {/* Export Modal */}
        <Modal
          open={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          title="Export Mappings"
          primaryAction={{
            content: 'Export All',
            onAction: handleExport
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: () => setExportModalOpen(false)
          }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">
                This will export all field mappings to a JSON file that can be imported later or shared with other instances.
              </Text>
              <Text as="p" tone="subdued">
                The export will include all categories and their current configuration.
              </Text>
            </BlockStack>
          </Modal.Section>
        </Modal>
        
        {/* Import Modal */}
        <Modal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          title="Import Mappings"
          primaryAction={{
            content: 'Import',
            onAction: handleImport,
            disabled: !importFile
          }}
          secondaryActions={[{
            content: 'Cancel',
            onAction: () => setImportModalOpen(false)
          }]}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                Select a mapping export file to import. This will overwrite existing mappings.
              </Text>
              
              <div>
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  style={{
                    padding: '8px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    width: '100%'
                  }}
                />
              </div>
              
              {importFile && (
                <Banner tone="info">
                  <Text as="p">
                    Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                  </Text>
                </Banner>
              )}
              
              <Banner tone="warning">
                <Text as="p">
                  <strong>Warning:</strong> Importing will replace all existing mappings. 
                  Consider exporting your current mappings first as a backup.
                </Text>
              </Banner>
            </BlockStack>
          </Modal.Section>
        </Modal>
      </Page>
    </Frame>
  );
};

export default Mappings;