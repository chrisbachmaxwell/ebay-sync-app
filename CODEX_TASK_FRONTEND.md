# Codex Task: Build Embedded Shopify Admin Frontend

## Context
This is an eBay sync app at `~/projects/ebay-sync-app/`. It has a working Express 5 server (`src/server/index.ts`) with these API endpoints:

- `GET /health` → `{"status":"ok","uptime":...}`
- `GET /api/status` → sync status, product/order counts, settings, recent notifications
- `GET /api/listings?limit=50&offset=0` → paginated product mappings
- `GET /api/orders?limit=50&offset=0` → paginated imported orders
- `GET /api/logs?source=ebay` → notification/webhook logs
- `GET /api/settings` → `{"sync_price":"true","sync_inventory":"true","auto_list":"false","sync_interval_minutes":"5","item_location":"305 W 700 S, Salt Lake City, UT 84101"}`
- `PUT /api/settings` → update settings (JSON body with key/value pairs)
- `POST /api/sync/trigger` → manually trigger sync

The server serves static files from `dist/web/`. We need to build a React frontend there.

## Task
Build a React + Vite frontend using Shopify Polaris components that embeds inside Shopify admin.

## Tech Stack
- React 18
- Vite 5
- `@shopify/polaris` for UI components
- `@shopify/app-bridge-react` for Shopify admin embedding
- `react-router-dom` v6 for navigation
- TypeScript

## Files to Create

### 1. `src/web/index.html`
Standard Vite HTML entry point.

### 2. `src/web/main.tsx`
React root with Polaris AppProvider.

### 3. `src/web/App.tsx`
Main app component with:
- Polaris `AppProvider` with `@shopify/polaris` English translations
- React Router with routes for each page
- Navigation frame with sidebar links: Dashboard, Listings, Orders, Settings, Logs

### 4. `src/web/pages/Dashboard.tsx`
Overview page showing:
- Status cards: Products Mapped, Orders Imported, Sync Status (use Polaris `Layout`, `Card`, `Text`)
- Recent activity list (last 5 notifications from `/api/logs`)
- "Sync Now" button that POSTs to `/api/sync/trigger`
- Current settings summary
- Fetch data from `/api/status` on mount

### 5. `src/web/pages/Listings.tsx`
Product listings table:
- Polaris `IndexTable` showing: Shopify Product ID, eBay Listing ID, eBay Inventory Item ID, Status, Created, Updated
- Pagination controls
- Fetch from `/api/listings`
- Status badges (Active = green, Inactive = yellow, Error = red)

### 6. `src/web/pages/Orders.tsx`
Imported orders table:
- Polaris `IndexTable` showing: eBay Order ID, Shopify Order ID, Shopify Order Name, Status, Synced At
- Pagination
- Fetch from `/api/orders`

### 7. `src/web/pages/Settings.tsx`
Settings form with:
- Toggle: Sync Price (sync_price)
- Toggle: Sync Inventory (sync_inventory)
- Toggle: Auto-list new products (auto_list)
- Number input: Sync interval minutes (sync_interval_minutes)
- Text input: Item location (item_location)
- Save button that PUTs to `/api/settings`
- Toast on successful save
- Fetch current settings from `/api/settings` on mount

### 8. `src/web/pages/Logs.tsx`
Log viewer:
- Polaris `IndexTable` showing: ID, Source (eBay/Shopify badge), Topic, Status, Created At
- Filter by source (All, eBay, Shopify)
- Expandable rows to show payload
- Fetch from `/api/logs`

### 9. `vite.config.ts` (in project root)
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/web',
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
      '/webhooks': 'http://localhost:3456',
      '/auth': 'http://localhost:3456',
      '/health': 'http://localhost:3456',
    },
  },
});
```

## Install Dependencies
Run:
```bash
npm install @shopify/polaris @shopify/app-bridge-react react react-dom react-router-dom
npm install -D @vitejs/plugin-react vite @types/react @types/react-dom
```

## Design Guidelines
- Use Shopify Polaris components everywhere (no custom CSS needed)
- Clean, professional look matching Shopify admin style
- Responsive — works on desktop and tablet
- Use `fetch()` for API calls (no axios needed)
- Show loading spinners while fetching data
- Handle errors gracefully with Polaris `Banner` components

## Build Verification
After building, verify:
1. `npx vite build --config vite.config.ts` succeeds
2. `dist/web/index.html` exists
3. `dist/web/assets/` has JS and CSS bundles

When completely finished, run: openclaw gateway wake --text "Done: Built React Polaris frontend for EbaySync — Dashboard, Listings, Orders, Settings, Logs pages" --mode now
