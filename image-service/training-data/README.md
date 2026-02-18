# Training Data for Background Removal Model

## Source: StyleShoots Drive

**Location:** `/Volumes/StyleShootsDrive/UsedCameraGear/`  
**Drive Type:** Network/external drive, mounted locally  
**Access:** Must be mounted on Frank's MacBook (auto-mounts when connected)  
**Integration:** `src/watcher/drive-search.ts` in ProductPipeline codebase

## Drive Overview

| Category (Preset Folder) | Product Folders | Total Images |
|---|---|---|
| Small Cameras - Body | 296 | 2,188 |
| Trade-Ins - Small Lenses | 405 | 2,562 |
| Trade Ins - Medium Telephoto Lens | 88 | 567 |
| Trade Ins - Large Telephoto lens | 17 | 110 |
| super telephoto lens | 11 | 69 |
| Camera Kit | 6 | 8 |
| Book | 6 | 45 |
| lights | 2 | 4 |
| Keen Shoes | 1 | 1 |
| Small Camera - Box | 1 | 1 |
| **TOTAL** | **833** | **5,555** |

## Image Specifications

- **Format:** JPEG (`.jpg`)
- **Resolution:** 4000×4000 pixels (square)
- **File Size:** ~5-7 MB per image
- **Camera:** Canon EOS R8 (StyleShoots machine)
- **Background:** White studio background (StyleShoots automated photo booth)
- **Avg images per product:** 6-7 (Front, Back, Side, Side 270, Top views)

## Naming Convention

```
{product-name}-{angle}-JPEG-{sequence}.jpg
```

Examples:
- `Canon r5 #816-Front-JPEG-1.jpg`
- `70-200 #365-Side 270-JPEG-1.jpg`
- `Sony a1 #402-Back-JPEG-1.jpg`

Angles: `Front`, `Back`, `Side`, `Side 270`, `Top`

## Downloaded Sample (this directory)

**254 images** across 6 categories:

| Directory | Count | Products Sampled |
|---|---|---|
| `cameras/` | 105 | Canon 5D IV, R5, R7, 6D II; Fuji XT5, X-T3; Leica M11, SL3; Nikon D850, D7500; Sony A1, A7IV, A7C II, A6600 |
| `lenses-small/` | 49 | 14-24, 16-35, 17-40, 24-70, 100mm, 105mm, 135mm Plena |
| `lenses-medium/` | 46 | 70-200 (×3), 24-70 GM, 28-70 f/2, 100 RF Macro, 50-140 ZF |
| `lenses-large/` | 37 | 100-400, 150-600, 200-500, 200-600, 400 f/2.8 |
| `lenses-super-telephoto/` | 13 | 600 f/4 Sony, 800 f/5.6, 800 PF |
| `accessories/` | 4 | Godox 300x, 600C lights |

## How to Download More

```bash
# Copy all images from a specific product
cp "/Volumes/StyleShootsDrive/UsedCameraGear/Small Cameras - Body/Sony a1 #402/"*.jpg ./originals/cameras/

# Copy all front shots from all camera bodies
for d in "/Volumes/StyleShootsDrive/UsedCameraGear/Small Cameras - Body/"*/; do
  cp "$d"*Front*JPEG*1.jpg ./originals/cameras/ 2>/dev/null
done

# Bulk copy entire category
cp -r "/Volumes/StyleShootsDrive/UsedCameraGear/Trade-Ins - Small Lenses/" ./originals/all-small-lenses/
```

## Notes for Training

- Images have white/near-white backgrounds from StyleShoots booth — ideal for training bg removal
- Products are photographed from multiple consistent angles
- Some products have light shadows on white background
- The `#XXX` suffix in folder/file names is a serial number identifier
- ~833 unique products with ~5,555 total multi-angle shots available
- Primary categories for camera store: bodies (296), small lenses (405), medium lenses (88)

## Shopify Processed Images (PhotoRoom Output)

**Source:** Shopify CDN (usedcameragear.myshopify.com)  
**API:** REST Admin API 2024-01 via client_credentials OAuth  
**Pipeline:** StyleShoots originals → PhotoRoom background removal → Shopify upload

### Naming Convention (Processed)
```
{product-name}-{angle}-JPEG-{sequence}-Photoroom.jpg
```
The `-Photoroom` suffix is appended by PhotoRoom during processing. Some files also have a UUID suffix from Shopify's CDN deduplication.

### Matched Pairs: 94

| Category | Pairs |
|---|---|
| cameras | 34 |
| lenses-small | 25 |
| lenses-medium | 18 |
| lenses-large | 14 |
| accessories | 3 |

### Matching Strategy

Originals and processed images are matched by normalizing filenames:
1. Strip `-Photoroom` suffix from processed filenames
2. Strip UUID suffixes (`_xxxxxxxx-xxxx-...`) from Shopify CDN names
3. Normalize `" #"` → `"_"`, spaces → `"_"`, lowercase
4. Also try stripping all non-alphanumeric chars except hyphens
5. Exact key match between original and processed

**Unmatched originals (160):** Mostly products where Shopify filename diverged significantly from StyleShoots naming (e.g., spaces removed, different abbreviations). Could be improved with fuzzy matching or by querying Shopify product metadata to find the original filename.

### Files

- `manifest.json` — 94 matched pairs with `{original_path, processed_path, product_name, category}`
- `selected_images.json` — metadata for all downloaded processed images
- `shopify_products_raw.json` — full Shopify product catalog (577 products)
- `originals/` — original StyleShoots photos (254 images, 6 categories)
- `processed/` — PhotoRoom-processed images from Shopify CDN

## Created

2026-02-18 by automated catalog agent (originals) and Shopify training data agent (processed/matching)
