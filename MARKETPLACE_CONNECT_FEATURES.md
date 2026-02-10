# Marketplace Connect (Codisto) — Feature Audit

Audited: 2026-02-10 by Frank, via browser on usedcameragear Shopify admin.

## Connected Accounts
- **Amazon**: "Used Camera Gear LLC" (Amazon.com, Seller ID: A1MRWHLZBUYMZP)
- **eBay**: "usedcam-0" (eBay.com, https://www.ebay.com/usr/usedcam-0)
- Walmart & Target+ available but not connected

## eBay-Specific Features (What We Need to Replicate)

### 1. Listings Management
- **Product listing table**: Code (SKU), Product name, Listing status (Active/Missing), Price, Inventory
- **Listing statuses**: Active (live on eBay), Missing (no eBay listing), Inactive
- **Link listings**: Match eBay listings to Shopify products by SKU/GTIN, close match, or manual
- **Bulk edit**: Edit multiple listings at once
- **Mapping button**: Per-listing attribute mapping

### 2. Attribute Mapping (Shopify → eBay)
- **Sales attributes** mapped to eBay fields:
  - Status
  - SKU (Product code linked inside eBay)
  - Variation mapping (for variants)
  - Quantity (Inventory available on eBay)
  - Select inventory location (All locations / specific)
  - "Do not synchronize Quantity" option

### 3. Order Import (eBay → Shopify)
- **Automatic order import**: eBay orders appear in Shopify with:
  - Date, Shopify order number, Marketplace order ID, Customer name, Total, Marketplace
  - eBay order IDs format: `XX-XXXXX-XXXXX` (e.g., 26-14196-90361)
- **Order volume**: Multiple orders per day (4 orders on Feb 10 alone)
- **Import settings**:
  - Order type (FBA/FBM/etc)
  - Order status filters
  - Order tagging (auto-apply tags to imported orders)
  - Customer tagging

### 4. Auto-Sync
- **Sync price**: ✅ Enabled (Shopify price → eBay price)
- **Sync inventory**: ✅ Enabled (Shopify stock → eBay quantity)
- Both run automatically

### 5. New Listing Defaults
- Auto categorization (eBay category auto-selection)
- Auto-list products (new Shopify products → auto eBay listing)
- Use web price (Shopify price as eBay price)
- Use Shopify stock level
- Flat rate domestic shipping
- Return policy enabled

### 6. eBay Templates
- Upload logo for eBay listing templates
- Preview and edit templates (Codisto template editor)
- Custom HTML/CSS for eBay listing appearance

### 7. Business Policies
- Option to use eBay's business policies (fulfillment, returns, payment)
- Currently toggled OFF (using Codisto defaults)
- eBay item condition policy (for refurbished/trading cards)

### 8. Default Item Location
- 305 west 700 south, Salt Lake City, Utah 84101, UNITED STATES
- Editable per account

### 9. Order Management
- Order type settings
- Order status settings
- Tax handling (separate section)

### 10. Buyer Feedback
- Auto-send feedback when configured
- Pre-set messages:
  - "Fast payment, great communications, fast and friendly emails"
  - "Great transaction, come back anytime!"
  - "Pleasure to do business with, highly recommended!"
  - "Very pleasant and courteous buyer, great to deal with, Thanks!"

### 11. Taxes
- Tax configuration section (details not fully visible)

## Features We Must Build (Priority Order)

### Phase 1 — Core (MVP to replace Codisto)
1. ✅ Shopify product read (DONE)
2. eBay listing creation (Shopify → eBay)
3. eBay order import (eBay → Shopify) — **CRITICAL, high volume**
4. Price sync (Shopify → eBay, automatic)
5. Inventory sync (Shopify → eBay, automatic)
6. SKU-based product matching/linking
7. Deduplication (don't re-import already-imported orders)

### Phase 2 — Parity
8. eBay category auto-mapping
9. Auto-list new products
10. Listing status tracking (Active/Missing/Inactive)
11. Item location config
12. Order tagging on import
13. Fulfillment sync (Shopify ship → eBay mark shipped)

### Phase 3 — Polish
14. eBay listing templates
15. Business policy support
16. Buyer feedback automation
17. Bulk edit operations
18. Tax handling

## Key Technical Notes
- eBay seller account: `usedcam-0`
- eBay store URL: https://www.ebay.com/usr/usedcam-0
- Store location: Salt Lake City, UT 84101
- High order volume — need reliable, frequent polling
- Orders have marketplace IDs we need to store for dedup
- Codisto uses an iframe inside Shopify admin — we'll be CLI + cron
