import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Global app state
interface AppStore {
  // UI State
  sidebarOpen: boolean;
  chatOpen: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
  
  // Sync State  
  activeSyncOperations: string[];
  lastSyncTime: Date | null;
  
  // Connection Status
  shopifyConnected: boolean;
  ebayConnected: boolean;
  
  // Notifications
  notifications: Notification[];
  
  // Actions
  toggleSidebar: () => void;
  toggleChat: () => void;
  setSyncStatus: (status: 'idle' | 'syncing' | 'error') => void;
  addSyncOperation: (operation: string) => void;
  removeSyncOperation: (operation: string) => void;
  setConnectionStatus: (platform: 'shopify' | 'ebay', connected: boolean) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  timestamp: Date;
  autoClose?: number; // milliseconds
}

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    sidebarOpen: true,
    chatOpen: false,
    syncStatus: 'idle',
    activeSyncOperations: [],
    lastSyncTime: null,
    shopifyConnected: false,
    ebayConnected: false,
    notifications: [],
    
    // Actions
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    
    toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
    
    setSyncStatus: (status) => {
      set({ syncStatus: status });
      if (status === 'idle') {
        set({ lastSyncTime: new Date() });
      }
    },
    
    addSyncOperation: (operation) =>
      set((state) => ({
        activeSyncOperations: [...state.activeSyncOperations, operation],
        syncStatus: 'syncing',
      })),
    
    removeSyncOperation: (operation) =>
      set((state) => {
        const newOperations = state.activeSyncOperations.filter(op => op !== operation);
        return {
          activeSyncOperations: newOperations,
          syncStatus: newOperations.length > 0 ? 'syncing' : 'idle',
        };
      }),
    
    setConnectionStatus: (platform, connected) =>
      set((state) => ({
        [platform === 'shopify' ? 'shopifyConnected' : 'ebayConnected']: connected,
      })),
    
    addNotification: (notification) =>
      set((state) => ({
        notifications: [
          {
            ...notification,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(),
          },
          ...state.notifications,
        ],
      })),
    
    removeNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter(n => n.id !== id),
      })),
    
    clearNotifications: () => set({ notifications: [] }),
  }))
);

// Auto-remove notifications with autoClose
useAppStore.subscribe(
  (state) => state.notifications,
  (notifications) => {
    notifications.forEach((notification) => {
      if (notification.autoClose) {
        setTimeout(() => {
          useAppStore.getState().removeNotification(notification.id);
        }, notification.autoClose);
      }
    });
  }
);