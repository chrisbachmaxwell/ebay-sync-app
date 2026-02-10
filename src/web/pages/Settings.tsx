import React, { useCallback, useEffect, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Layout,
  Page,
  Spinner,
  TextField,
  Toast,
} from '@shopify/polaris';

type SettingsResponse = Record<string, string>;

type SettingsState = {
  syncPrice: boolean;
  syncInventory: boolean;
  autoList: boolean;
  syncIntervalMinutes: string;
  itemLocation: string;
};

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/settings');
      if (!response.ok) {
        throw new Error('Failed to load settings');
      }
      const data = (await response.json()) as SettingsResponse;
      setSettings({
        syncPrice: data.sync_price === 'true',
        syncInventory: data.sync_inventory === 'true',
        autoList: data.auto_list === 'true',
        syncIntervalMinutes: data.sync_interval_minutes ?? '5',
        itemLocation: data.item_location ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        sync_price: String(settings.syncPrice),
        sync_inventory: String(settings.syncInventory),
        auto_list: String(settings.autoList),
        sync_interval_minutes: settings.syncIntervalMinutes,
        item_location: settings.itemLocation,
      };

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setShowToast(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page title="Settings">
      {error && (
        <Banner tone="critical" title="Settings update failed">
          <p>{error}</p>
        </Banner>
      )}
      <Layout>
        <Layout.Section>
          <Card>
            {loading || !settings ? (
              <Spinner accessibilityLabel="Loading settings" size="large" />
            ) : (
              <Layout>
                <Layout.Section>
                  <Checkbox
                    label="Sync price"
                    checked={settings.syncPrice}
                    onChange={(value: boolean) =>
                      setSettings({
                        ...settings,
                        syncPrice: value,
                      })
                    }
                  />
                  <Checkbox
                    label="Sync inventory"
                    checked={settings.syncInventory}
                    onChange={(value: boolean) =>
                      setSettings({
                        ...settings,
                        syncInventory: value,
                      })
                    }
                  />
                  <Checkbox
                    label="Auto-list new products"
                    checked={settings.autoList}
                    onChange={(value: boolean) =>
                      setSettings({
                        ...settings,
                        autoList: value,
                      })
                    }
                  />
                </Layout.Section>
                <Layout.Section>
                  <TextField
                    label="Sync interval minutes"
                    type="number"
                    value={settings.syncIntervalMinutes}
                    onChange={(value: string) =>
                      setSettings({
                        ...settings,
                        syncIntervalMinutes: value,
                      })
                    }
                    autoComplete="off"
                  />
                </Layout.Section>
                <Layout.Section>
                  <TextField
                    label="Item location"
                    value={settings.itemLocation}
                    onChange={(value: string) =>
                      setSettings({
                        ...settings,
                        itemLocation: value,
                      })
                    }
                    autoComplete="off"
                  />
                </Layout.Section>
                <Layout.Section>
                  <Button variant="primary" onClick={handleSave} loading={saving}>
                    Save settings
                  </Button>
                </Layout.Section>
              </Layout>
            )}
          </Card>
        </Layout.Section>
      </Layout>
      {showToast && <Toast content="Settings saved" onDismiss={() => setShowToast(false)} />}
    </Page>
  );
};

export default Settings;
