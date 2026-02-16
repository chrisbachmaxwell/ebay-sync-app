# PROJECT.md — eBay Sync App / Product Bridge

> **Single source of truth** for the app's architecture, services, credentials, deployment, and current status.

## Overview

| Field | Value |
|-------|-------|
| **App Name** | Product Bridge (originally "eBay Sync App") |
| **Purpose** | Shopify ↔ eBay sync + auto-listing pipeline for UsedCameraGear.com |
| **Repos** | [mrfrankbot/ebay-sync-app](https://github.com/mrfrankbot/ebay-sync-app) (primary), [mrfrankbot/product-bridge](https://github.com/mrfrankbot/product-bridge) |
| **Deployment** | Railway — `https://ebay-sync-app-production.up.railway.app` |
| **Shopify Store** | `usedcameragear.myshopify.com` (usedcameragear.com / pictureline.com) |
| **Shopify App** | Embedded app (App Bridge + Polaris), client ID `2db0555e4848a8264383dc0edfcfb8fe` |
| **eBay Seller** | `usedcam-0` — https://www.ebay.com/usr/usedcam-0 |
| **Version** | 0.2.0 |
| **Tech Stack** | TypeScript, Express 5, React 19, Vite 7, SQLite (better-sqlite3 + drizzle-orm), Tailwind 4 |

## Architecture (High-Level)

```
┌──────────────────────────────────────────────────────────────────┐
│  SHOPIFY (usedcameragear.myshopify.com)                         │
│  - Products, Orders, Inventory                                   │
│  - Webhooks → our server (products/update, orders/fulfilled)     │
└──────────────────┬───────────────────────────────────────────────┘
                   │  Shopify GraphQL + REST API
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  PRODUCT BRIDGE SERVER (Railway)                                 │
│  Express + React SPA                                             │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐               │
│  │ Sync Engines│ │ Pipeline    │ │ Embedded UI  │               │
│  │ order-sync  │ │ AI Desc     │ │ Dashboard    │               │
│  │ product-sync│ │ PhotoRoom   │ │ Listings     │               │
│  │ inventory   │ │ eBay Create │ │ Pipeline     │               │
│  │ price-sync  │ │             │ │ Settings     │               │
│  │ fulfillment │ │             │ │ Analytics    │               │
│  └─────────────┘ └─────────────┘ └──────────────┘               │
│                                                                  │
│  SQLite DB (~/.clawdbot/ebaysync.db)                            │
└──────────────────┬───────────────────────────────────────────────┘
                   │  eBay REST APIs (Inventory, Fulfillment, Browse)
                   ▼
┌──────────────────────────────────────────────────────────────────┐
│  EBAY (usedcam-0 seller account)                                │
│  - Listings, Orders, Inventory, Promoted Listings               │
│  - Platform Notifications → our server                           │
└──────────────────────────────────────────────────────────────────┘
```

Detailed architecture docs: [ARCHITECTURE.md](./ARCHITECTURE.md) and [ARCHITECTURE_V2.md](./ARCHITECTURE_V2.md)

## Credentials

All credentials live in `~/.clawdbot/credentials/`:

| File | Contents |
|------|----------|
| `shopify-usedcameragear-api.txt` | Shopify Client ID + Secret |
| `ebay-api.txt` | eBay App ID, Dev ID, Cert ID, RuName |
| `photoroom-api-key.txt` | PhotoRoom API key |
| `railway-token.txt` | Railway deploy token |

**Environment variables** (set on Railway):
- `OPENAI_API_KEY` — GPT-4o-mini for AI descriptions + category suggestions
- `PHOTOROOM_API_KEY` — Image processing (background removal, templates)
- `PHOTOROOM_TEMPLATE_ID` — Default: `014ca360-cb57-416e-8c17-365a647ca4ac`
- `PORT` — Server port (default 3000)

**OAuth tokens** stored in SQLite `auth_tokens` table (auto-refreshed):
- Shopify access token (long-lived)
- eBay access + refresh tokens (auto-refreshed via `token-manager.ts`)

## Key Services

### 1. PhotoRoom (`src/services/photoroom.ts`)
- **Background removal**: `POST https://sdk.photoroom.com/v1/segment`
- **Image editing** (white bg, shadow, padding): `POST https://image-api.photoroom.com/v2/edit`
- **Template rendering**: `POST https://image-api.photoroom.com/v1/render`
- Falls back to original Shopify image URLs if API key not set

### 2. OpenAI (`src/sync/auto-listing-pipeline.ts`)
- **Model**: `gpt-4o-mini`
- **Description generation**: Professional used-camera-gear copywriting (configurable system prompt stored in `settings` table)
- **Category suggestion**: Returns eBay category ID based on product name
- Both run in parallel during pipeline execution

### 3. eBay API (`src/ebay/`)
- **Inventory API** — create/update listings, manage offers and inventory items
- **Fulfillment API** — order fetching, shipping fulfillments
- **Browse API** — search/read listings
- **Trading API** — business policies (legacy)
- **Token Manager** — automatic OAuth refresh

### 4. Shopify API (`src/shopify/`)
- **GraphQL client** — product listing queries
- **REST API** — product details, order creation, inventory levels, image upload
- **Webhooks** — products/update, orders/fulfilled, inventory_levels/update

## Auto-Listing Pipeline

**File**: `src/sync/auto-listing-pipeline.ts`
**API endpoint**: `POST /api/auto-list/{shopifyProductId}` (via pipeline routes)

### Pipeline Steps

```
Step 1: Fetch Product       → Shopify REST API → get title, vendor, images, variants
Step 2: Generate Description → OpenAI GPT-4o-mini → professional product description
         + Category Suggestion  → OpenAI GPT-4o-mini → eBay category ID
Step 3: Process Images       → PhotoRoom API → background removal + white bg + shadow
Step 4: Save Overrides       → SQLite → description + category stored as product overrides
```

### Pipeline Tracking
- Each run creates a `pipeline_jobs` record with step-by-step status
- `product_pipeline_status` table tracks per-product AI/image state
- Pipeline UI at `/pipeline` shows real-time job progress

### Image Processing Detail
1. Fetches each Shopify image URL
2. Sends to PhotoRoom template render API
3. Saves processed PNG to temp directory (`/tmp/ebay-sync-images/{productId}/`)
4. Returns array of processed file paths (or falls back to original URLs)

## Database

**Location**: `~/.clawdbot/ebaysync.db` (SQLite via better-sqlite3)

| Table | Purpose |
|-------|---------|
| `auth_tokens` | OAuth tokens for Shopify + eBay |
| `product_mappings` | Shopify product ↔ eBay listing links (with cached title/price/SKU) |
| `product_pipeline_status` | Per-product AI description + image processing state |
| `pipeline_jobs` | Auto-listing pipeline job tracking (step-by-step) |
| `order_mappings` | eBay order ↔ Shopify order links (dedup) |
| `sync_log` | Audit trail of all sync operations |
| `field_mappings` | Configurable field/condition/category mappings |
| `attribute_mappings` | Extended attribute mapping system (sales/listing/payment/shipping categories) |
| `product_mapping_overrides` | Per-product overrides for description, category, etc. |
| `notification_log` | eBay notification + Shopify webhook history |
| `settings` | Key/value store for sync config + UI settings |
| `help_questions` | Help center Q&A content |
| `feature_requests` | User feature request tracking |

## API Endpoints

### Core Sync
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync/products` | Sync Shopify products → eBay listings |
| `PUT` | `/api/sync/products/:id` | Update existing eBay listing from Shopify |
| `POST` | `/api/sync/products/:id/end` | End an eBay listing |
| `POST` | `/api/sync/inventory` | Sync inventory Shopify → eBay |
| `POST` | `/api/sync/inventory/:sku` | Sync specific SKU inventory |
| `POST` | `/api/sync/prices` | Sync prices Shopify → eBay |
| `POST` | `/api/sync/trigger` | Manual full sync trigger |

### Auto-Listing Pipeline
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auto-list/:id` | Run auto-listing pipeline for a Shopify product |
| `GET` | `/api/pipeline/jobs` | List all pipeline jobs |
| `GET` | `/api/pipeline/jobs/:id` | Get single pipeline job status |

### Listing Management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/listings/republish-stale` | Republish listings older than N days |
| `POST` | `/api/listings/apply-price-drops` | Apply price drops to eligible listings |
| `POST` | `/api/listings/promote` | Enable Promoted Listings |
| `GET` | `/api/listings/stale` | Get stale listings eligible for action |
| `GET` | `/api/listings/health` | Listing health dashboard data |

### Data & Config
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Overall sync status overview |
| `GET` | `/api/products/overview` | Unified Shopify + pipeline + eBay status |
| `GET/PUT` | `/api/settings` | Read/update app settings |
| `GET/PUT` | `/api/mappings` | Attribute mapping CRUD |
| `GET` | `/api/listings` | Paginated product listings |
| `GET` | `/api/orders` | Imported order history |

### Webhooks
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/shopify/*` | Shopify webhook receiver (product/order/inventory events) |
| `POST` | `/webhooks/ebay/*` | eBay Platform Notification receiver |

## Embedded UI (React SPA)

Built with React 19 + Shopify Polaris + Tailwind CSS + Recharts.

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Sync status, stats, connections, recent activity |
| Pipeline | `/pipeline` | Auto-listing pipeline job manager + 4-stage visualizer |
| eBay Listings | `/ebay/listings` | Product listing management (active/draft/missing) |
| Shopify Products | `/products` | Shopify product browser with pipeline status |
| Mappings | `/mappings` | Attribute mapping configuration |
| Analytics | `/logs` | Listing health, sync history, error log |
| Settings | `/settings` | Connections, sync config, AI prompt editor |
| Help Center | `/help` | Help articles + AI-powered Q&A |
| Help Admin | `/help-admin` | Manage help center content |
| Feature Requests | `/features` | User feature request board |
| Image Processor | `/images` | Standalone PhotoRoom image testing |

## Project Structure

```
src/
├── cli/               # CLI commands (Commander.js) — debug/admin tool
│   ├── index.ts       # Entry point + full sync command
│   ├── auth.ts        # auth shopify / auth ebay
│   ├── products.ts    # products list / products sync
│   ├── orders.ts      # orders sync / orders list
│   ├── inventory.ts   # inventory sync
│   └── status.ts      # Dashboard with counts
├── server/            # Express web server
│   ├── index.ts       # App entry, middleware, scheduler
│   ├── capabilities.ts # Feature discovery
│   ├── sync-helper.ts # Background sync utilities
│   ├── middleware/
│   │   └── auth.ts    # API key + rate limiting
│   └── routes/
│       ├── api.ts     # Core REST API (status, listings, orders, settings, sync, mappings)
│       ├── pipeline.ts # Pipeline job API
│       ├── shopify-auth.ts     # Shopify OAuth install/callback
│       ├── ebay-auth.ts        # eBay OAuth flow
│       ├── shopify-webhooks.ts # Shopify webhook handlers
│       ├── ebay-notifications.ts # eBay Platform Notification handlers
│       ├── chat.ts    # AI chat assistant API
│       ├── help.ts    # Help center API
│       ├── features.ts # Feature requests API
│       └── health.ts  # Health check
├── web/               # React SPA (Shopify embedded app)
│   ├── App.tsx        # Root with routing
│   ├── main.tsx       # Vite entry
│   ├── pages/         # Dashboard, Pipeline, Listings, etc.
│   ├── components/    # Shared UI components
│   ├── hooks/         # useApi, etc.
│   └── store/         # Zustand state management
├── sync/              # Core sync engines
│   ├── auto-listing-pipeline.ts  # Full auto-list pipeline (AI + images + eBay)
│   ├── pipeline-status.ts        # Pipeline job tracking
│   ├── product-sync.ts           # Shopify → eBay product sync
│   ├── order-sync.ts             # eBay → Shopify order import
│   ├── inventory-sync.ts         # Shopify → eBay quantity sync
│   ├── price-sync.ts             # Shopify → eBay price sync
│   ├── fulfillment-sync.ts       # Shopify → eBay shipping updates
│   ├── listing-manager.ts        # Republish stale, price drops, promoted listings
│   ├── mapper.ts                 # Field mapping (condition, category, carrier)
│   ├── mapping-service.ts        # Mapping CRUD service
│   ├── attribute-mapping-service.ts # Extended attribute mapping
│   ├── category-mapper.ts        # eBay category mapping
│   └── aspect-mapper.ts          # eBay item aspects mapping
├── services/          # External service integrations
│   ├── photoroom.ts   # PhotoRoom API (bg removal, templates)
│   └── image-processor.ts # Image processing orchestrator
├── ebay/              # eBay API clients
│   ├── client.ts      # Base HTTP client + token exchange
│   ├── auth.ts        # OAuth consent flow
│   ├── token-manager.ts # Auto-refresh expired tokens
│   ├── inventory.ts   # Inventory API (items + offers)
│   ├── fulfillment.ts # Fulfillment API (orders + shipping)
│   ├── browse.ts      # Browse API (search listings)
│   ├── trading.ts     # Account/Trading API (business policies)
│   └── notifications.ts # Platform Notification management
├── shopify/           # Shopify API clients
│   ├── client.ts      # GraphQL + REST client setup
│   ├── products.ts    # Product fetching (GraphQL + REST, pagination)
│   ├── orders.ts      # Order creation + dedup search
│   └── inventory.ts   # Inventory levels + locations
├── db/                # SQLite database
│   ├── client.ts      # DB connection + table initialization
│   └── schema.ts      # Drizzle ORM schema definitions
├── config/
│   └── credentials.ts # Load credentials from ~/.clawdbot/credentials/
└── utils/
    ├── logger.ts      # Colored structured logging
    └── retry.ts       # Retry with exponential backoff
```

## StyleShoots Integration

| Field | Value |
|-------|-------|
| **Drive** | `smb://192.168.15.243/StyleShootsDrive` |
| **Mount Point** | `/Volumes/StyleShootsDrive` |
| **Photo Folder** | `/Volumes/StyleShootsDrive/UsedCameraGear/` |
| **Naming Convention** | `"product name #lastThreeSerialDigits"` (e.g. `sigma 24-70 #624`) |

Photos from the StyleShoots machine are saved to a shared network drive. A future folder watcher module will watch for new product folders, match them to Shopify products, and feed local photos into the auto-listing pipeline.

See [STYLESHOOT_WATCHER_DESIGN.md](./STYLESHOOT_WATCHER_DESIGN.md) for the design.

## What's Working ✅

- **Shopify OAuth** — Full install/callback flow, token stored in DB
- **eBay OAuth** — Consent flow with auto-refresh token management
- **Order Sync** (eBay → Shopify) — Imports eBay orders as Shopify orders with dedup
- **Product Sync** (Shopify → eBay) — Creates/updates eBay listings from Shopify products
- **Inventory Sync** — Shopify quantities pushed to eBay
- **Price Sync** — Shopify prices pushed to eBay
- **Fulfillment Sync** — Shopify shipments marked on eBay
- **Auto-Listing Pipeline** — AI description + category suggestion + PhotoRoom image processing
- **Pipeline Status Tracking** — Real-time job status with 4-stage visualizer
- **Embedded Shopify UI** — Full React SPA (Dashboard, Pipeline, Listings, Analytics, Settings, Help)
- **Attribute Mapping System** — Configurable field/condition/category mappings with per-product overrides
- **Listing Management** — Stale listing republish, price drop scheduling, Promoted Listings
- **Background Scheduler** — Auto-sync with configurable interval (disabled by default)
- **Webhook Receivers** — Shopify webhooks + eBay Platform Notifications
- **Help Center** — AI-powered Q&A with admin content management
- **API Security** — API key auth, rate limiting, CORS, webhook HMAC verification
- **830+ products** loaded from Shopify, 1 draft listing on eBay (Sony FE 50mm)
- **Railway Deployment** — `ebay-sync-app-production.up.railway.app`

## What's Left / TODO 🚧

### High Priority
- **Bulk eBay listing creation** — Pipeline works per-product; need batch auto-list for all 830+ products
- **eBay listing publish** — Currently saves as draft/overrides; full eBay Inventory API publish not wired end-to-end
- **Shopify image upload** — `uploadToShopify()` in `image-processor.ts` is a stub; processed images aren't written back to Shopify
- **StyleShoots folder watcher** — Designed but not built (see `STYLESHOOT_WATCHER_DESIGN.md`)
- **eBay Platform Notifications** — Receiver exists but subscription setup + signature verification need testing with real events

### Medium Priority
- **Error recovery** — Pipeline failures don't auto-retry; need retry queue
- **Image upload to eBay** — Pipeline processes images to local temp files but doesn't upload to eBay Inventory API `pictureURLs`
- **Full sync scheduling** — Auto-sync exists but only does order sync; inventory/price/fulfillment sync not in scheduler
- **Shopify webhooks registration** — Webhook receiver works but webhook subscriptions aren't auto-registered on install
- **Test coverage** — No automated tests; manual QA only (see `QC_REPORT.md`)

### Nice to Have
- **Condition detection from photos** — Use AI/vision to assess item condition from StyleShoots photos
- **Batch PhotoRoom processing** — Parallel image processing for faster throughput
- **Price history tracking** — Track price changes over time for analytics
- **Multi-store support** — Currently hardcoded to `usedcameragear.myshopify.com`
- **CLI deprecation** — CLI still works but UI is primary; could simplify
- **Real-time UI updates** — Socket.io client is imported but not wired to server-side events

## Agent Conventions

**ALL agents working on this project MUST follow these rules:**

1. **Always commit AND push** — Every agent commits with a descriptive message AND runs `git push origin main` before finishing
2. **Read PROJECT.md first** — This file is the single source of truth
3. **Read STYLESHOOT_WATCHER_DESIGN.md** for watcher-related work
4. **Run `npm run build`** before committing — don't push broken code
5. **Update PROJECT.md** if you add new endpoints, tables, services, or major features
6. **Repo remotes:** `origin` = github.com/mrfrankbot/ebay-sync-app
7. **Branch:** work on `main` unless told otherwise
8. **Don't use sleep commands** — work quickly and efficiently

## Related Docs

| Doc | Description |
|-----|-------------|
| [README.md](./README.md) | CLI usage and quick start |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Original CLI architecture (v1) |
| [ARCHITECTURE_V2.md](./ARCHITECTURE_V2.md) | Embedded app architecture (v2 — current) |
| [STYLESHOOT_WATCHER_DESIGN.md](./STYLESHOOT_WATCHER_DESIGN.md) | Folder watcher module design |
| [QC_REPORT.md](./QC_REPORT.md) | Latest QA test report (Feb 13, 2026) |
| [CODEX_DASHBOARD_REDESIGN.md](./CODEX_DASHBOARD_REDESIGN.md) | Dashboard redesign spec |
| [CODEX_PRODUCTS_REDESIGN.md](./CODEX_PRODUCTS_REDESIGN.md) | Products page redesign spec |
| [MAPPING_SYSTEM_COMPLETE.md](./MAPPING_SYSTEM_COMPLETE.md) | Mapping system documentation |
| [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) | Security review |
| [UI_DESIGN_PLAN.md](./UI_DESIGN_PLAN.md) | UI/UX design specifications |

---

*Last updated: February 16, 2026*
