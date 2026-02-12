import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/web/**/*.{js,ts,jsx,tsx}',
    './src/web/**/**/*.{js,ts,jsx,tsx}',
    './index.html'
  ],
  theme: {
    extend: {
      colors: {
        // Shopify brand colors
        shopify: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#00A651', // Primary Shopify green
          600: '#008a43',
          700: '#006b34',
          800: '#15803d',
          900: '#14532d',
        },
        // eBay brand colors  
        ebay: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#0064D2', // Primary eBay blue
          600: '#0055b3',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Status colors
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        // Dark mode colors
        dark: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        }
      },
      fontFamily: {
        'shopify': ['-apple-system', 'BlinkMacSystemFont', 'San Francisco', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace']
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'bounce-subtle': 'bounceSubtle 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceSubtle: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-2px)' },
          '60%': { transform: 'translateY(-1px)' },
        },
      },
      boxShadow: {
        'polaris': '0 0 0 1px rgba(99,115,129,0.12), 0 1px 0 0 rgba(99,115,129,0.16)',
        'polaris-hover': '0 0 0 1px rgba(99,115,129,0.12), 0 2px 8px 0 rgba(99,115,129,0.16)',
        'chat': '0 4px 24px rgba(0,0,0,0.1)',
        'glow': '0 0 20px rgba(34, 197, 94, 0.2)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
  // Don't purge Polaris classes
  safelist: [
    {
      pattern: /^Polaris-.*/,
    },
  ],
  // Don't prefix for now - we'll be careful about conflicts
  // prefix: 'tw-',
  important: false,
} satisfies Config;