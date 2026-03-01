#!/usr/bin/env python3
"""
modal_face_guard.py  --  PhotoGuard face protection via Modal GPU (~30 seconds)
===============================================================================

1. Detects faces locally (MTCNN, CPU, ~1 second)
2. Runs the PhotoGuard VAE encoder attack on Modal's A10G GPU (~30 seconds)
3. Saves the protected image â€” visually identical but AI vision models fail

Usage:
    modal run modal_face_guard.py --input photo.jpg
    modal run modal_face_guard.py --input photo.jpg --output safe.jpg
"""

from __future__ import annotations

import io
import time
from typing import List

import modal

# ---------------------------------------------------------------------------
# Container image  (VAE baked in at build time â†’ fast warm starts)
# ---------------------------------------------------------------------------

app_image = (
    modal.Image.debian_slim(python_version="3.11")
    # Install torch FIRST with a version that has torch.xpu (needed by diffusers)
    .pip_install("torch==2.4.1", "torchvision==0.19.1")
    .pip_install(
        "diffusers==0.30.3",
        "accelerate>=0.26.0",
        "transformers>=4.36.0",
        "facenet-pytorch>=2.5.3",
        "Pillow>=10.0.0",
        "numpy>=1.24.0",
    )
    # Pre-download the VAE weights into the image (~700 MB)
    .run_commands(
        "python -c \""
        "from diffusers import AutoencoderKL; "
        "AutoencoderKL.from_pretrained("
        "'runwayml/stable-diffusion-inpainting', subfolder='vae'"
        ")\""
    )
)

app = modal.App("velum-face-guard", image=app_image)


# ---------------------------------------------------------------------------
# GPU function â€” ~30 seconds on A10G
# ---------------------------------------------------------------------------

@app.function(gpu="A10G", timeout=120, retries=1)
def protect_faces_gpu(
    image_bytes: bytes,
    face_boxes: List[List[float]],
    seed: int = 42,
    eps: float = 0.06,
    iters: int = 200,
    padding: float = 0.15,
    jpeg_quality: int = 92,
) -> bytes:
    """PhotoGuard VAE encoder attack.  ~30 seconds on A10G.

    Pushes each face's VAE latent toward a random target so AI models
    produce garbage when they try to understand or edit the face.
    Visually the perturbation is invisible to humans.
    """
    import numpy as np
    import torch
    from PIL import Image
    from diffusers import AutoencoderKL

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    W, H = img.size
    print(f"[GPU] {W}x{H}  |  {len(face_boxes)} face(s)  |  seed={seed}")

    device = "cuda"
    dtype = torch.float16

    # Cache VAE across warm-container calls
    if not hasattr(protect_faces_gpu, "_vae"):
        print("[GPU] Loading VAE...")
        vae = AutoencoderKL.from_pretrained(
            "runwayml/stable-diffusion-inpainting",
            subfolder="vae",
            torch_dtype=dtype,
        ).to(device).eval()
        for p in vae.parameters():
            p.requires_grad_(False)
        protect_faces_gpu._vae = vae
    vae = protect_faces_gpu._vae

    def to_tensor(pil_img):
        w, h = pil_img.size
        w, h = max(32, w - w % 32), max(32, h - h % 32)
        pil_img = pil_img.resize((w, h), resample=Image.LANCZOS)
        arr = np.array(pil_img).astype(np.float32) / 255.0
        t = torch.from_numpy(arr[None].transpose(0, 3, 1, 2))
        return (2.0 * t - 1.0).to(device=device, dtype=dtype)

    def to_pil(tensor):
        arr = (tensor / 2 + 0.5).clamp(0, 1)
        arr = arr.squeeze(0).permute(1, 2, 0).cpu().float().numpy()
        return Image.fromarray((arr * 255).astype(np.uint8))

    def pgd(face_t, target_lat, n_iters, epsilon, step=0.01):
        X = face_t.clone().detach()
        X_adv = (X + torch.rand_like(X) * 2 * epsilon - epsilon).clamp(-1, 1)
        for i in range(n_iters):
            s = step - (step - step / 100) / n_iters * i
            X_adv.requires_grad_(True)
            loss = (vae.encode(X_adv).latent_dist.mean - target_lat).norm()
            grad = torch.autograd.grad(loss, X_adv)[0]
            X_adv = (X_adv.detach() - grad.detach().sign() * s)
            X_adv = torch.minimum(torch.maximum(X_adv, X - epsilon), X + epsilon)
            X_adv = X_adv.clamp(-1, 1)
            if (i + 1) % 50 == 0:
                print(f"   iter {i+1}/{n_iters}  loss={loss.item():.4f}")
        return X_adv.detach()

    result = img.copy()
    for i, box in enumerate(face_boxes):
        x1, y1, x2, y2 = [int(v) for v in box]
        fw, fh = x2 - x1, y2 - y1
        px, py = int(fw * padding), int(fh * padding)
        x1, y1 = max(0, x1 - px), max(0, y1 - py)
        x2, y2 = min(W, x2 + px), min(H, y2 + py)

        crop = result.crop((x1, y1, x2, y2))
        orig_size = crop.size
        print(f"[GPU] Face {i+1}: ({x1},{y1})-({x2},{y2})")

        face_t = to_tensor(crop)
        torch.manual_seed(seed ^ (i * 0x9E3779B9))
        with torch.no_grad():
            target_lat = torch.randn_like(vae.encode(face_t).latent_dist.mean)

        adv_t = pgd(face_t, target_lat, iters, eps)
        adv_crop = to_pil(adv_t).resize(orig_size, resample=Image.LANCZOS)
        result.paste(adv_crop, (x1, y1))

    buf = io.BytesIO()
    result.save(buf, "JPEG", quality=jpeg_quality)
    out = buf.getvalue()
    print(f"[GPU] Done  ({len(out):,} bytes)")
    return out


# ---------------------------------------------------------------------------
# CLI  â€”  runs locally, sends faces to Modal GPU
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    input: str = "photo.jpg",
    output: str = "",
    seed: str = "42",
    iters: int = 200,
    eps: float = 0.06,
    quality: int = 92,
):
    """
    Usage:
        modal run modal_face_guard.py --input photo.jpg
        modal run modal_face_guard.py --input photo.jpg --output safe.jpg
        modal run modal_face_guard.py --input photo.jpg --seed abc123
    """
    import hashlib
    from PIL import Image
    from facenet_pytorch import MTCNN

    # Default output
    if not output:
        stem = input.rsplit(".", 1)[0]
        output = stem + "_protected.jpg"

    # Derive integer seed
    try:
        seed_int = int(seed)
    except ValueError:
        try:
            seed_int = int(seed[:16], 16)
        except ValueError:
            seed_int = int.from_bytes(hashlib.sha256(seed.encode()).digest()[:8], "big")

    # Load image
    img = Image.open(input).convert("RGB")
    print(f"Loaded {input}  ({img.width}x{img.height})")

    # Detect faces on CPU (~1 second)
    detector = MTCNN(keep_all=True, device="cpu", min_face_size=40,
                     thresholds=[0.6, 0.7, 0.8], post_process=False)
    boxes, probs = detector.detect(img)

    if boxes is None or len(boxes) == 0:
        print("No faces detected â€” saving unchanged.")
        img.save(output, "JPEG", quality=quality)
        return

    boxes = boxes[probs >= 0.90]
    if len(boxes) == 0:
        print("No faces above confidence â€” saving unchanged.")
        img.save(output, "JPEG", quality=quality)
        return

    print(f"Found {len(boxes)} face(s) â€” sending to Modal GPU...")

    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=95)

    t0 = time.time()
    result_bytes = protect_faces_gpu.remote(
        image_bytes=buf.getvalue(),
        face_boxes=boxes.tolist(),
        seed=seed_int,
        eps=eps,
        iters=iters,
        jpeg_quality=quality,
    )
    elapsed = time.time() - t0

    with open(output, "wb") as f:
        f.write(result_bytes)

