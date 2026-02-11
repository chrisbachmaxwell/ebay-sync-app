# eBay Sync App — Structured Test Plan

## Setup
- Pick 1 test product in Shopify (usedcameragear.myshopify.com)
- Product should have: title, price, SKU, images, inventory > 0
- Re-auth eBay (token was revoked during incident)

## Test Cases (single product, sequential)

### TC1: Shopify → eBay Listing Creation
- **Action:** Trigger product sync for 1 product
- **Expected:** eBay listing created with correct title, price, images, SKU, condition
- **Verify:** Listing visible on ebay.com/usr/usedcam-0

### TC2: Price Change (Shopify → eBay)
- **Action:** Change price in Shopify (e.g. $500 → $450)
- **Expected:** eBay listing price updates automatically within sync interval
- **Verify:** eBay listing shows $450

### TC3: Price Change Back
- **Action:** Change price back in Shopify ($450 → $500)
- **Expected:** eBay listing price reverts
- **Verify:** eBay listing shows $500

### TC4: Inventory Decrease (Shopify → eBay)
- **Action:** Reduce Shopify inventory (e.g. 3 → 1)
- **Expected:** eBay quantity updates to 1
- **Verify:** eBay listing shows quantity 1

### TC5: Inventory to Zero — DELIST
- **Action:** Set Shopify inventory to 0
- **Expected:** eBay listing immediately ends/deactivated (not just quantity 0)
- **Verify:** eBay listing shows as ended/out of stock
- **Critical:** Must not remain active with 0 quantity — buyers could still purchase

### TC6: Inventory Restocked — RELIST
- **Action:** Set Shopify inventory back to 2
- **Expected:** eBay listing reactivated automatically
- **Verify:** eBay listing is active again with quantity 2

### TC7: eBay Sale → Shopify Order
- **Action:** Simulate or wait for eBay purchase (or use eBay sandbox)
- **Expected:** 
  - Order appears in Shopify with correct customer info, line items, price
  - Tagged: `eBay,usedcam-0,eBay-{orderId}`
  - No duplicate created
  - Shopify inventory decrements
- **Verify:** Order in Shopify admin, inventory reduced

### TC8: Shopify Fulfillment → eBay Shipped
- **Action:** Fulfill the Shopify order with tracking number
- **Expected:** eBay order marked as shipped with tracking
- **Verify:** eBay shows shipped status + tracking number

### TC9: Dedup — Re-sync doesn't duplicate
- **Action:** Trigger manual sync again
- **Expected:** Same eBay order is skipped (already imported)
- **Verify:** Order count stays the same, logs show "skipped"

### TC10: Product Update (title/description)
- **Action:** Change product title in Shopify
- **Expected:** eBay listing title updates on next sync
- **Verify:** eBay listing shows new title

### TC11: Product Delete — End Listing
- **Action:** Delete or archive product in Shopify
- **Expected:** eBay listing ended
- **Verify:** Listing no longer active on eBay

## Edge Cases (after core tests pass)

### EC1: Variant product
- Test with a product that has multiple variants (size/color)
- Each variant should map to eBay correctly

### EC2: Multiple images
- Product with 5+ images
- All should upload to eBay in correct order

### EC3: Rapid inventory changes
- Change inventory multiple times quickly
- Should settle to final value, not queue conflicting updates

### EC4: eBay order for unlinked product
- Someone buys on eBay — product not in our mapping table
- Order should still import, just without Shopify inventory adjustment

## Pass Criteria
- All TC1-TC11 pass
- Zero duplicate orders
- Inventory stays in sync within 5 minutes
- Zero-stock products are NOT active on eBay
