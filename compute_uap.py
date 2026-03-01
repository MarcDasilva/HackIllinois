#!/usr/bin/env python3
"""
compute_uap.py  --  Universal Adversarial Perturbation precomputation
=====================================================================

Run this ONCE to generate `uap_pattern.npy`.  The pattern is then
applied instantly (<1 s) by `image_hardener.py` to any image.

Algorithm
---------
1. Load MobileNetV3-small as the feature extractor.
2. Generate batches of diverse synthetic images (gradients, checker-
   boards, circles, multi-scale noise, gaussian-blurred textures).
3. For each batch:
   - Compute clean feature vector.
   - Add current perturbation, compute perturbed features.
   - Backprop gradient of feature-distortion loss.
   - FGSM sign-step update on the perturbation.
   - Project onto L-inf ball (epsilon).
4. Save final perturbation as `uap_pattern.npy`.

Usage
-----
    python compute_uap.py                       # defaults
    python compute_uap.py --iters 1000 --eps 12
    python compute_uap.py -o my_uap.npy
"""

import argparse
import math
import time

import numpy as np
import torch
import torch.nn as nn
import torchvision.models as models

# ---------------------------------------------------------------------------
# Synthetic image generators  (all produce [B, 3, 224, 224] float tensors)
# ---------------------------------------------------------------------------

def _rand_gradients(batch: int, rng: np.random.Generator) -> np.ndarray:
    """Smooth linear gradients with random direction and colour."""
    imgs = np.zeros((batch, 3, 224, 224), dtype=np.float32)
    for i in range(batch):
        angle = rng.uniform(0, 2 * math.pi)
        cos_a, sin_a = math.cos(angle), math.sin(angle)
        yy, xx = np.mgrid[0:224, 0:224]
        ramp = (xx * cos_a + yy * sin_a) / (224 * math.sqrt(2))
        ramp = ramp.astype(np.float32)
        for c in range(3):
            lo = rng.uniform(0, 0.4)
            hi = rng.uniform(0.6, 1.0)
            imgs[i, c] = lo + ramp * (hi - lo)
    return imgs


def _rand_checkerboards(batch: int, rng: np.random.Generator) -> np.ndarray:
    """Checkerboard patterns with random cell size and colours."""
    imgs = np.zeros((batch, 3, 224, 224), dtype=np.float32)
    for i in range(batch):
        cell = int(rng.integers(8, 56))
        yy, xx = np.mgrid[0:224, 0:224]
        mask = ((xx // cell) + (yy // cell)) % 2 == 0
        c1 = rng.uniform(0, 1, size=(3, 1, 1)).astype(np.float32)
        c2 = rng.uniform(0, 1, size=(3, 1, 1)).astype(np.float32)
        imgs[i] = np.where(mask[None], c1, c2)
    return imgs


def _rand_circles(batch: int, rng: np.random.Generator) -> np.ndarray:
    """Random concentric circles / rings."""
    imgs = np.zeros((batch, 3, 224, 224), dtype=np.float32)
    yy, xx = np.mgrid[0:224, 0:224]
    for i in range(batch):
        cx = rng.uniform(40, 184)
        cy = rng.uniform(40, 184)
        dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2).astype(np.float32)
        freq = rng.uniform(0.02, 0.15)
        wave = 0.5 + 0.5 * np.sin(dist * freq * 2 * math.pi)
        for c in range(3):
            phase = rng.uniform(0, 2 * math.pi)
            imgs[i, c] = 0.5 + 0.5 * np.sin(dist * freq * 2 * math.pi + phase)
    return imgs


def _rand_noise(batch: int, rng: np.random.Generator) -> np.ndarray:
    """Multi-scale noise: coarse random blocks upscaled + fine grain."""
    imgs = np.zeros((batch, 3, 224, 224), dtype=np.float32)
    for i in range(batch):
        # coarse (28x28 random, upscaled)
        coarse = rng.uniform(0, 1, size=(3, 28, 28)).astype(np.float32)
        coarse = np.repeat(np.repeat(coarse, 8, axis=1), 8, axis=2)
        # fine grain
        fine = rng.uniform(0, 1, size=(3, 224, 224)).astype(np.float32)
        alpha = rng.uniform(0.3, 0.7)
        imgs[i] = np.clip(alpha * coarse + (1 - alpha) * fine, 0, 1)
    return imgs


def _rand_blurred_textures(batch: int, rng: np.random.Generator) -> np.ndarray:
    """Gaussian-blurred random textures using scipy."""
    from scipy.ndimage import gaussian_filter
    imgs = np.zeros((batch, 3, 224, 224), dtype=np.float32)
    for i in range(batch):
        raw = rng.uniform(0, 1, size=(3, 224, 224)).astype(np.float32)
        sigma = rng.uniform(3.0, 15.0)
        for c in range(3):
            imgs[i, c] = gaussian_filter(raw[c], sigma=sigma)
        # re-normalise to [0, 1]
        mn = imgs[i].min()
        mx = imgs[i].max()
        if mx - mn > 1e-6:
            imgs[i] = (imgs[i] - mn) / (mx - mn)
    return imgs


_GENERATORS = [
    _rand_gradients,
    _rand_checkerboards,
    _rand_circles,
    _rand_noise,
    _rand_blurred_textures,
]


def generate_batch(batch: int, rng: np.random.Generator) -> np.ndarray:
    """Pick a random generator and produce a batch of synthetic images."""
    gen = _GENERATORS[rng.integers(0, len(_GENERATORS))]
    return gen(batch, rng)


# ---------------------------------------------------------------------------
# Feature extractor wrapper
# ---------------------------------------------------------------------------

class FeatureExtractor(nn.Module):
    """MobileNetV3-small with classification head removed."""

    def __init__(self):
        super().__init__()
        net = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
        self.features = net.features
        self.pool = nn.AdaptiveAvgPool2d(1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: [B, 3, 224, 224] in [0, 1]
        # ImageNet normalisation
        mean = torch.tensor([0.485, 0.456, 0.406], device=x.device).view(1, 3, 1, 1)
        std  = torch.tensor([0.229, 0.224, 0.225], device=x.device).view(1, 3, 1, 1)
        x = (x - mean) / std
        feat = self.features(x)
        feat = self.pool(feat).flatten(1)
        return feat


# ---------------------------------------------------------------------------
# UAP computation
# ---------------------------------------------------------------------------

def compute_uap(
    iters: int = 500,
    eps: float = 10.0 / 255,
    batch_size: int = 8,
    step_size: float = 1.0 / 255,
    output_path: str = "uap_pattern.npy",
    seed: int = 0,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[UAP] device = {device}")
    print(f"[UAP] iters={iters}  eps={eps:.4f}  batch={batch_size}  step={step_size:.5f}")

    rng = np.random.default_rng(seed)

    model = FeatureExtractor().to(device).eval()
    for p in model.parameters():
        p.requires_grad_(False)

    # Perturbation: [1, 3, 224, 224]
    delta = torch.zeros(1, 3, 224, 224, device=device)

    t0 = time.time()
    for it in range(iters):
        batch_np = generate_batch(batch_size, rng)  # [B, 3, 224, 224]
        clean = torch.from_numpy(batch_np).to(device)

        # --- clean features (detached) ---
        with torch.no_grad():
            feat_clean = model(clean)

        # --- perturbed features (need grad through delta) ---
        delta_var = delta.clone().detach().requires_grad_(True)
        perturbed = torch.clamp(clean + delta_var, 0.0, 1.0)
        feat_pert = model(perturbed)

        # Loss: maximise feature distortion (negative cosine similarity + L2)
        cos_sim = nn.functional.cosine_similarity(feat_clean, feat_pert, dim=1).mean()
        l2_dist = (feat_clean - feat_pert).pow(2).sum(dim=1).mean()
        loss = cos_sim - 0.01 * l2_dist  # minimise cos_sim, maximise l2

        loss.backward()

        # FGSM sign update
        with torch.no_grad():
            grad_sign = delta_var.grad.sign()
            delta = delta - step_size * grad_sign  # step to INCREASE distortion
            # Project onto L-inf ball
            delta = delta.clamp(-eps, eps)

        if (it + 1) % 50 == 0 or it == 0:
            elapsed = time.time() - t0
            print(f"  iter {it+1:>4d}/{iters}  loss={loss.item():+.4f}  "
                  f"cos_sim={cos_sim.item():.4f}  l2={l2_dist.item():.2f}  "
                  f"[{elapsed:.1f}s]")

    elapsed = time.time() - t0
    print(f"[UAP] Done in {elapsed:.1f}s")

    # Save as numpy: shape [3, 224, 224], float32, values in [-eps, +eps]
    uap = delta.squeeze(0).cpu().numpy()
    np.save(output_path, uap)
    print(f"[UAP] Saved {output_path}  shape={uap.shape}  "
          f"range=[{uap.min():.5f}, {uap.max():.5f}]")
    return uap


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Precompute Universal Adversarial Perturbation (UAP) pattern"
    )
    ap.add_argument("--iters", type=int, default=500,
                    help="Number of FGSM iterations (default 500)")
    ap.add_argument("--eps", type=float, default=10.0,
                    help="L-inf epsilon in /255 units (default 10)")
    ap.add_argument("--batch", type=int, default=8,
                    help="Batch size per iteration (default 8)")
    ap.add_argument("--step", type=float, default=1.0,
                    help="FGSM step size in /255 units (default 1)")
    ap.add_argument("-o", "--output", default="uap_pattern.npy",
                    help="Output .npy file (default uap_pattern.npy)")
    ap.add_argument("--seed", type=int, default=0,
                    help="RNG seed for synthetic image generation")
    args = ap.parse_args()

    compute_uap(
        iters=args.iters,
        eps=args.eps / 255.0,
        batch_size=args.batch,
        step_size=args.step / 255.0,
        output_path=args.output,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
