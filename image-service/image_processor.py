"""Image processing: background, padding, shadow, resize.

v3 — Quality improvements:
- Advanced edge refinement: color decontamination + adaptive erosion
- Better shadow: consistent, properly offset, realistic soft shadow
- Content-aware centering with tight bounding box
- White-on-white edge handling
"""

from PIL import Image, ImageFilter, ImageOps, ImageDraw
import numpy as np


def refine_edges(foreground: Image.Image, strength: str = "medium") -> Image.Image:
    """Advanced edge refinement to eliminate halos.
    
    Multi-step approach:
    1. Color decontamination: remove background color bleed from edge pixels
    2. Alpha threshold: clean up semi-transparent fringe
    3. Adaptive erosion: shrink mask to cut into halo zone
    4. Smooth feathering: natural edge transition
    """
    fg = foreground.copy().convert("RGBA")
    arr = np.array(fg, dtype=np.float32)
    alpha = arr[:, :, 3]
    rgb = arr[:, :, :3]
    
    # --- Step 1: Color decontamination ---
    # Edge pixels often have background color bleed.
    # For pixels near the edge (semi-transparent), push their color
    # toward the nearest fully-opaque pixel color.
    edge_mask = (alpha > 5) & (alpha < 240)
    if np.any(edge_mask):
        # Get the average color of fully opaque pixels
        solid_mask = alpha > 240
        if np.any(solid_mask):
            for c in range(3):
                channel = rgb[:, :, c]
                solid_mean = np.mean(channel[solid_mask])
                # Blend edge pixels toward the solid color
                blend_factor = alpha[edge_mask] / 255.0
                channel[edge_mask] = (
                    channel[edge_mask] * blend_factor + 
                    solid_mean * (1 - blend_factor) * 0.3 +  # partial decontamination
                    channel[edge_mask] * (1 - blend_factor) * 0.7
                )
                rgb[:, :, c] = channel
    
    arr[:, :, :3] = rgb
    
    # --- Step 2: Alpha threshold ---
    # Kill very faint pixels (noise/halo fringe) — gentler thresholds for BiRefNet
    alpha[alpha < 8] = 0
    # Strengthen nearly-opaque pixels
    alpha[alpha > 245] = 255
    
    # --- Step 3: Erosion ---
    erode_passes = {"light": 1, "medium": 2, "heavy": 3}.get(strength, 2)
    alpha_img = Image.fromarray(alpha.astype(np.uint8))
    for _ in range(erode_passes):
        alpha_img = alpha_img.filter(ImageFilter.MinFilter(3))
    
    # --- Step 4: Feathering ---
    alpha_img = alpha_img.filter(ImageFilter.GaussianBlur(radius=0.5))
    alpha = np.array(alpha_img, dtype=np.float32)
    
    # Re-threshold after feathering
    alpha[alpha > 240] = 255
    alpha[alpha < 8] = 0
    
    arr[:, :, 3] = alpha
    return Image.fromarray(arr.astype(np.uint8))


def get_content_bbox(foreground: Image.Image, threshold: int = 10) -> tuple[int, int, int, int]:
    """Get tight bounding box of actual content."""
    alpha = np.array(foreground.split()[3])
    rows = np.any(alpha > threshold, axis=1)
    cols = np.any(alpha > threshold, axis=0)
    if not rows.any():
        return (0, 0, foreground.width, foreground.height)
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    return (int(cmin), int(rmin), int(cmax) + 1, int(rmax) + 1)


def crop_to_content(foreground: Image.Image) -> Image.Image:
    """Crop image to its content bounding box."""
    bbox = get_content_bbox(foreground)
    return foreground.crop(bbox)


def add_shadow(
    foreground: Image.Image,
    canvas_size: tuple[int, int],
    paste_pos: tuple[int, int],
    offset: tuple[int, int] = (6, 16),
    blur_radius: int = 22,
    opacity: float = 0.35,
) -> Image.Image:
    """Create a realistic dual-layer shadow on the full canvas.
    
    Uses full-opacity black for the shadow shape, blurs it, THEN scales
    the alpha down to the target opacity. This prevents blur from making
    the shadow invisible.
    """
    canvas_w, canvas_h = canvas_size
    alpha = foreground.split()[3]
    alpha_arr = np.array(alpha, dtype=np.float32)
    
    # --- Cast shadow: offset, blurred ---
    shadow_mask = np.where(alpha_arr > 20, 255, 0).astype(np.uint8)
    shadow_canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    shadow_img = Image.new("RGBA", foreground.size, (0, 0, 0, 0))
    shadow_img.putalpha(Image.fromarray(shadow_mask))
    
    sx = paste_pos[0] + offset[0]
    sy = paste_pos[1] + offset[1]
    shadow_canvas.paste(shadow_img, (sx, sy), shadow_img)
    shadow_canvas = shadow_canvas.filter(ImageFilter.GaussianBlur(radius=blur_radius))
    
    # Scale alpha down to target opacity
    sc_arr = np.array(shadow_canvas)
    sc_arr[:, :, 3] = (sc_arr[:, :, 3].astype(np.float32) * opacity).astype(np.uint8)
    shadow_canvas = Image.fromarray(sc_arr)
    
    # --- Contact shadow: tight, darker, less blur ---
    contact_canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    contact_img = Image.new("RGBA", foreground.size, (0, 0, 0, 0))
    contact_img.putalpha(Image.fromarray(shadow_mask))
    contact_canvas.paste(contact_img, (paste_pos[0] + 2, paste_pos[1] + 4), contact_img)
    contact_canvas = contact_canvas.filter(ImageFilter.GaussianBlur(radius=5))
    
    # Contact shadow at higher opacity for grounding
    cc_arr = np.array(contact_canvas)
    cc_arr[:, :, 3] = (cc_arr[:, :, 3].astype(np.float32) * 0.4).astype(np.uint8)
    contact_canvas = Image.fromarray(cc_arr)
    
    # Combine: contact shadow first, then cast shadow on top
    result = Image.alpha_composite(contact_canvas, shadow_canvas)
    return result


def process_image(
    foreground: Image.Image,
    background_color: str = "FFFFFF",
    padding: float = 0.1,
    shadow: bool = True,
    output_size: tuple[int, int] = (1200, 1200),
) -> Image.Image:
    """
    Full image processing pipeline v3:
    1. Refine edges (color decontamination + erosion)
    2. Crop to content bounding box
    3. Scale to fill ~80% of frame (maintain aspect ratio)
    4. Perfect center alignment
    5. Add realistic dual-layer shadow (contact + cast)
    6. Composite onto solid background
    """
    fg = foreground.convert("RGBA")
    target_w, target_h = output_size

    # Step 1: Edge refinement (light for BiRefNet — it already has clean edges)
    fg = refine_edges(fg, strength="light")
    
    # Step 2: Crop to content
    fg = crop_to_content(fg)

    # Step 3: Scale to fill frame properly
    # Use padding to determine fill percentage
    inner_w = int(target_w * (1 - 2 * padding))
    inner_h = int(target_h * (1 - 2 * padding))

    # Resize to fit, maintaining aspect ratio
    fg.thumbnail((inner_w, inner_h), Image.LANCZOS)

    # Step 4: Perfect centering
    paste_x = (target_w - fg.width) // 2
    paste_y = (target_h - fg.height) // 2

    # Create canvas
    canvas = Image.new("RGBA", output_size, (0, 0, 0, 0))

    # Step 5: Shadow (behind foreground)
    if shadow:
        shadow_layer = add_shadow(
            fg, canvas_size=output_size, paste_pos=(paste_x, paste_y),
            offset=(6, 14), blur_radius=22, opacity=0.35
        )
        canvas = Image.alpha_composite(canvas, shadow_layer)

    # Paste foreground
    canvas.paste(fg, (paste_x, paste_y), fg)

    # Step 6: Background composite
    r = int(background_color[0:2], 16)
    g = int(background_color[2:4], 16)
    b = int(background_color[4:6], 16)
    bg = Image.new("RGBA", output_size, (r, g, b, 255))

    result = Image.alpha_composite(bg, canvas)
    return result.convert("RGB")
