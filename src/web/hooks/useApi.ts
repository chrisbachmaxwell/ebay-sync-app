import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../store';

// Types for API responses
export interface StatusResponse {
  status: string;
  products: { mapped: number; pending: number; failed: number };
  orders: { imported: number; pending: number; recent: number };
  inventory: { synced: number; outOfSync: number };
  revenue: { today: number; month: number; ebayFees: number };
  lastSyncs: Array<Record<string, unknown>>;
  recentNotifications: LogEntry[];
  settings: Record<string, string>;
  uptime: number;
  shopifyConnected: boolean;
  ebayConnected: boolean;
}

export interface LogEntry {
  id: number;
  source: string;
  topic: string;
  status: string;
  createdAt: string;
  payload: string;
}

export interface ProductMapping {
  id: string;
  shopifyProductId: string;
  ebayItemId: string;
  title: string;
  sku: string;
  status: string;
  lastSynced: string;
  price: number;
  quantity: number;
}

export interface OrderMapping {
  id: string;
  ebayOrderId: string;
  shopifyOrderId: string;
  customerEmail: string;
  total: number;
  status: string;
  createdAt: string;
}

// API client
class ApiClient {
  private baseUrl = '/api';

  async get<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}

const api = new ApiClient();

// React Query hooks
export const useStatus = () => {
  const { setConnectionStatus } = useAppStore();
  
  const query = useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<StatusResponse>('/status'),
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Handle success in useEffect
  React.useEffect(() => {
    if (query.data) {
      setConnectionStatus('shopify', query.data.shopifyConnected);
      setConnectionStatus('ebay', query.data.ebayConnected);
    }
  }, [query.data, setConnectionStatus]);

  return query;
};

export const useLogs = (limit = 10) => {
  return useQuery({
    queryKey: ['logs', limit],
    queryFn: () => api.get<{ data: LogEntry[] }>(`/logs?limit=${limit}`),
    refetchInterval: 10000, // Poll every 10 seconds
  });
};

export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<{ data: ProductMapping[] }>('/products'),
    staleTime: 30000, // 30 seconds
  });
};

export const useOrders = () => {
  return useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<{ data: OrderMapping[] }>('/orders'),
    staleTime: 30000, // 30 seconds
  });
};

export const useMappings = () => {
  return useQuery({
    queryKey: ['mappings'],
    queryFn: () => api.get('/mappings'),
    staleTime: 60000, // 1 minute
  });
};

// Mutation hooks
export const useSyncProducts = () => {
  const queryClient = useQueryClient();
  const { addSyncOperation, removeSyncOperation, addNotification } = useAppStore();

  return useMutation({
    mutationFn: (data?: any) => {
      addSyncOperation('products');
      return api.post('/sync/products', data);
    },
    onSuccess: () => {
      removeSyncOperation('products');
      addNotification({
        type: 'success',
        title: 'Product sync completed',
        autoClose: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (error) => {
      removeSyncOperation('products');
      addNotification({
        type: 'error',
        title: 'Product sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        autoClose: 10000,
      });
    },
  });
};

export const useSyncOrders = () => {
  const queryClient = useQueryClient();
  const { addSyncOperation, removeSyncOperation, addNotification } = useAppStore();

  return useMutation({
    mutationFn: (data?: any) => {
      addSyncOperation('orders');
      return api.post('/sync/orders', data);
    },
    onSuccess: () => {
      removeSyncOperation('orders');
      addNotification({
        type: 'success',
        title: 'Order sync completed',
        autoClose: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (error) => {
      removeSyncOperation('orders');
      addNotification({
        type: 'error',
        title: 'Order sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        autoClose: 10000,
      });
    },
  });
};

export const useSyncInventory = () => {
  const queryClient = useQueryClient();
  const { addSyncOperation, removeSyncOperation, addNotification } = useAppStore();

  return useMutation({
    mutationFn: (data?: any) => {
      addSyncOperation('inventory');
      return api.post('/sync/inventory', data);
    },
    onSuccess: () => {
      removeSyncOperation('inventory');
      addNotification({
        type: 'success',
        title: 'Inventory sync completed',
        autoClose: 5000,
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['status'] });
    },
    onError: (error) => {
      removeSyncOperation('inventory');
      addNotification({
        type: 'error',
        title: 'Inventory sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        autoClose: 10000,
      });
    },
  });
};