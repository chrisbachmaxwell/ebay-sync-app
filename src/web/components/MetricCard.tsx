import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: number | string;
  trend?: {
    value: number;
    period: string;
  };
  icon?: React.ReactNode;
  color?: 'default' | 'success' | 'warning' | 'error' | 'shopify' | 'ebay';
  loading?: boolean;
  onClick?: () => void;
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  trend,
  icon,
  color = 'default',
  loading = false,
  onClick,
}) => {
  const colorClasses = {
    default: 'border-gray-200',
    success: 'border-green-200 bg-green-50',
    warning: 'border-yellow-200 bg-yellow-50',
    error: 'border-red-200 bg-red-50',
    shopify: 'border-shopify-200 bg-shopify-50',
    ebay: 'border-ebay-200 bg-ebay-50',
  };

  const iconColors = {
    default: 'text-gray-400',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    error: 'text-red-500',
    shopify: 'text-shopify-500',
    ebay: 'text-ebay-500',
  };

  const getTrendIcon = () => {
    if (!trend) return null;
    
    if (trend.value > 0) {
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    } else if (trend.value < 0) {
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    } else {
      return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getTrendColor = () => {
    if (!trend) return '';
    return trend.value > 0 ? 'text-green-600' : trend.value < 0 ? 'text-red-600' : 'text-gray-600';
  };

  const formatValue = (val: number | string) => {
    if (typeof val === 'number') {
      if (val >= 1000000) {
        return `${(val / 1000000).toFixed(1)}M`;
      } else if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}K`;
      }
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <div
      className={`metric-card border-2 ${colorClasses[color]} ${
        onClick ? 'cursor-pointer hover:shadow-lg transition-all duration-200' : ''
      }`}
      onClick={onClick}
    >
      {/* Header with icon */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        {icon && <div className={iconColors[color]}>{icon}</div>}
      </div>

      {/* Main value */}
      <div className="mb-2">
        {loading ? (
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ) : (
          <p className="metric-value">{formatValue(value)}</p>
        )}
      </div>

      {/* Trend indicator */}
      {trend && !loading && (
        <div className="flex items-center gap-1 mt-2">
          {getTrendIcon()}
          <span className={`text-sm font-medium ${getTrendColor()}`}>
            {trend.value > 0 ? '+' : ''}{trend.value}%
          </span>
          <span className="text-xs text-gray-500">{trend.period}</span>
        </div>
      )}

      {/* Loading state for trend */}
      {loading && (
        <div className="animate-pulse mt-2">
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
      )}
    </div>
  );
};

export default MetricCard;