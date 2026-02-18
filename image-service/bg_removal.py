"""Background removal using BiRefNet ONNX model (replaces u2net).

BiRefNet is the same architecture used by BRIA RMBG-2.0, providing
significantly better edge quality, especially for:
- White-on-white products
- Reflective/transparent surfaces  
- Complex shapes (tripods, cables, thin structures)
- Fine detail preservation

Model: onnx-community/BiRefNet-ONNX (MIT license)
Input: 1024x1024 RGB, ImageNet normalization
Output: sigmoid mask (multiple outputs, last is best)
"""

import io
import os
import numpy as np
from PIL import Image
import onnxruntime as ort

MODEL_DIR = os.path.expanduser("~/.birefnet")
MODEL_PATH = os.path.join(MODEL_DIR, "model_lite.onnx")
MODEL_URL = "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx"

# BiRefNet uses 1024x1024 input (vs u2net's 320x320)
INPUT_SIZE = 1024

_session = None


def _get_model_path() -> str:
    """Download BiRefNet ONNX if not cached."""
    if os.path.exists(MODEL_PATH):
        return MODEL_PATH
    os.makedirs(MODEL_DIR, exist_ok=True)
    print(f"Downloading BiRefNet model to {MODEL_PATH}...")
    import urllib.request
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    return MODEL_PATH


def _get_session() -> ort.InferenceSession:
    global _session
    if _session is None:
        model_path = _get_model_path()
        # Force CPU only — CoreML can OOM on large models
        providers = ["CPUExecutionProvider"]
        _session = ort.InferenceSession(model_path, providers=providers)
        print(f"BiRefNet loaded with providers: {providers}")
    return _session


def _preprocess(img: Image.Image) -> np.ndarray:
    """Resize to 1024x1024, normalize with ImageNet stats, NCHW float32."""
    img = img.convert("RGB").resize((INPUT_SIZE, INPUT_SIZE), Image.LANCZOS)
    arr = np.array(img).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406])
    std = np.array([0.229, 0.224, 0.225])
    arr = (arr - mean) / std
    arr = arr.transpose(2, 0, 1)[np.newaxis, ...]
    return arr.astype(np.float32)


def _postprocess(output: np.ndarray, orig_size: tuple[int, int]) -> Image.Image:
    """Convert BiRefNet output to alpha mask at original resolution.
    
    BiRefNet outputs a logit map; apply sigmoid then resize.
    """
    mask = output.squeeze()
    # Apply sigmoid (output is logits, not probabilities)
    mask = 1.0 / (1.0 + np.exp(-mask))
    # Normalize to full 0-255 range
    mask = np.clip(mask, 0, 1)
    mask = (mask * 255).astype(np.uint8)
    mask_img = Image.fromarray(mask).resize(orig_size, Image.LANCZOS)
    return mask_img


def remove_background_pil(image: Image.Image) -> Image.Image:
    """Remove background from PIL Image, return RGBA PIL Image."""
    session = _get_session()
    orig_size = image.size
    input_tensor = _preprocess(image)
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_tensor})
    
    # BiRefNet outputs multiple maps; last one is the finest/best
    mask = _postprocess(outputs[-1], orig_size)
    
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def remove_background(image_bytes: bytes) -> bytes:
    """Remove background from image bytes, return PNG bytes with transparency."""
    img = Image.open(io.BytesIO(image_bytes))
    result = remove_background_pil(img)
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()
