import React from 'react';
import { CheckCircle, Clock, AlertCircle, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store';

interface StatusIndicatorProps {
  type: 'sync' | 'connection';
  status: 'idle' | 'syncing' | 'error' | 'connected' | 'disconnected';
  label?: string;
  platform?: 'shopify' | 'ebay';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  type,
  status,
  label,
  platform,
  size = 'md',
  showIcon = true,
}) => {
  const { activeSyncOperations } = useAppStore();

  const getStatusConfig = () => {
    if (type === 'sync') {
      switch (status) {
        case 'idle':
          return {
            color: 'status-idle',
            icon: <CheckCircle className="w-4 h-4" />,
            text: label || 'Ready',
          };
        case 'syncing':
          return {
            color: 'status-syncing',
            icon: <RefreshCw className="w-4 h-4 animate-spin" />,
            text: label || `Syncing (${activeSyncOperations.length})`,
          };
        case 'error':
          return {
            color: 'status-error',
            icon: <AlertCircle className="w-4 h-4" />,
            text: label || 'Error',
          };
        default:
          return {
            color: 'status-idle',
            icon: <Clock className="w-4 h-4" />,
            text: label || 'Unknown',
          };
      }
    } else {
      // Connection status
      const platformColors = {
        shopify: status === 'connected' ? 'bg-shopify-100 text-shopify-700' : 'bg-gray-100 text-gray-700',
        ebay: status === 'connected' ? 'bg-ebay-100 text-ebay-700' : 'bg-gray-100 text-gray-700',
      };

      return {
        color: platform ? platformColors[platform] : 'status-idle',
        icon: status === 'connected' ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />,
        text: label || `${platform?.toUpperCase() || 'Platform'} ${status}`,
      };
    }
  };

  const config = getStatusConfig();
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  return (
    <div className={`status-indicator ${config.color} ${sizeClasses[size]}`}>
      {showIcon && config.icon}
      <span>{config.text}</span>
    </div>
  );
};

export default StatusIndicator;