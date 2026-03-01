#!/usr/bin/env python3
"""
Adversarial Perturbation Engine for PDF Hardener
=================================================
Computes gradient-based adversarial perturbations (PGD) against proxy
vision/OCR models.  The resulting pixel noise is *structured* — it
specifically activates the wrong neurons in vision models — unlike
random noise or invisible text which has ~0% effectiveness.

Architecture:
  - Ensemble attack: TrOCR-small (OCR-specific) + MobileNetV3 (generic vision)
  - Tile-based: splits large page images into manageable tiles
  - JPEG-robust: differentiable JPEG approximation inside the PGD loop (EOT)
  - L-inf bounded: default epsilon=8/255 (~3.1%), invisible to humans

Usage:
  engine = AdversarialEngine(epsilon=8/255, steps=10)
  perturbed_image = engine.attack(page_image)
"""

from __future__ import annotations

import math
import warnings
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image

# PyTorch imports — all optional; the engine gracefully degrades
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    # Stubs so the module can be imported without torch
    torch = None
    nn = None
    F = None

try:
    import torchvision.models as tv_models
    import torchvision.transforms as T
    TORCHVISION_AVAILABLE = True
except ImportError:
    TORCHVISION_AVAILABLE = False

try:
    from transformers import VisionEncoderDecoderModel, AutoImageProcessor
    TROCR_AVAILABLE = True
except ImportError:
    TROCR_AVAILABLE = False


# ---------------------------------------------------------------------------
# Differentiable JPEG Approximation
# ---------------------------------------------------------------------------
# Real JPEG uses DCT quantization which is non-differentiable.  We
# approximate it so gradients flow through the compression step,
# ensuring our perturbations survive the actual JPEG compression
# that happens later in the PDF pipeline.

if TORCH_AVAILABLE:

    class DifferentiableJPEG(nn.Module):
        """Approximate JPEG compression as a differentiable operation.

        Uses DCT-domain quantization with straight-through estimator (STE)
        for the rounding step, allowing gradients to flow through.
        Quality maps to a quantization scaling factor.
        """

        def __init__(self, quality: int = 88):
            super().__init__()
            self.quality = quality
            self.register_buffer("quant_table", self._build_quant_table(quality))
            self.register_buffer("dct_mat", self._dct_matrix())

        @staticmethod
        def _build_quant_table(quality: int) -> "torch.Tensor":
            """Build quantization table scaled by JPEG quality."""
            # Standard JPEG luminance quantization matrix
            base = torch.tensor([
                [16, 11, 10, 16, 24, 40, 51, 61],
                [12, 12, 14, 19, 26, 58, 60, 55],
                [14, 13, 16, 24, 40, 57, 69, 56],
                [14, 17, 22, 29, 51, 87, 80, 62],
                [18, 22, 37, 56, 68, 109, 103, 77],
                [24, 35, 55, 64, 81, 104, 113, 92],
                [49, 64, 78, 87, 103, 121, 120, 101],
                [72, 92, 95, 98, 112, 100, 103, 99],
            ], dtype=torch.float32)

            if quality < 50:
                scale = 5000.0 / quality
            else:
                scale = 200.0 - 2.0 * quality

            table = torch.clamp(
                torch.floor((base * scale + 50.0) / 100.0), 1, 255
            )
            return table

        @staticmethod
        def _dct_matrix() -> "torch.Tensor":
            """Build 8x8 DCT-II basis matrix."""
            mat = torch.zeros(8, 8)
            for i in range(8):
                for j in range(8):
                    if i == 0:
                        mat[i, j] = 1.0 / math.sqrt(8)
                    else:
                        mat[i, j] = math.sqrt(2.0 / 8) * math.cos(
                            math.pi * (2 * j + 1) * i / 16.0
                        )
            return mat

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            """Apply approximate JPEG compression.

            Args:
                x: Image tensor [B, C, H, W] in [0, 1] range.

            Returns:
                JPEG-approximated image tensor, same shape.
            """
            B, C, H, W = x.shape

            # Pad to multiple of 8
            pad_h = (8 - H % 8) % 8
            pad_w = (8 - W % 8) % 8
            if pad_h > 0 or pad_w > 0:
                x = F.pad(x, (0, pad_w, 0, pad_h), mode="reflect")

            _, _, Hp, Wp = x.shape

            # Shift to [-128, 128] range (standard JPEG)
            x_shifted = x * 255.0 - 128.0

            # Reshape into 8x8 blocks:  [B*C, nH, nW, 8, 8]
            x_reshaped = x_shifted.reshape(B * C, Hp // 8, 8, Wp // 8, 8)
            x_blocks = x_reshaped.permute(0, 1, 3, 2, 4).contiguous()
            # x_blocks shape: [B*C, nH, nW, 8, 8]

            # Apply DCT via matrix multiply
            dct = self.dct_mat  # [8, 8]
            # coeffs = dct @ block @ dct^T   for each block
            coeffs = torch.einsum("ij,...jk,lk->...il", dct, x_blocks, dct)

            # Quantize with STE (straight-through estimator)
            qt = self.quant_table  # [8, 8]
            quantized = coeffs / qt
            # STE: forward does round, backward passes gradient through
            quantized = quantized + (torch.round(quantized) - quantized).detach()
            dequantized = quantized * qt

            # Inverse DCT
            reconstructed = torch.einsum(
                "ji,...jk,kl->...il", dct, dequantized, dct
            )

            # Reshape back to image
            # reconstructed: [B*C, nH, nW, 8, 8]
            nH, nW = Hp // 8, Wp // 8
            out = reconstructed.permute(0, 1, 3, 2, 4).contiguous()
            out = out.reshape(B, C, Hp, Wp)

            # Shift back to [0, 1]
            result = (out + 128.0) / 255.0
            result = torch.clamp(result, 0.0, 1.0)

            # Remove padding
            if pad_h > 0 or pad_w > 0:
                result = result[:, :, :H, :W]

            return result


    # -------------------------------------------------------------------
    # Feature extraction wrappers
    # -------------------------------------------------------------------

    class MobileNetFeatureExtractor(nn.Module):
        """Wraps MobileNetV3-small as a feature extractor.

        We maximize the L2 distance between original and perturbed
        features, which transfers to disrupting downstream vision models.
        """

        def __init__(self):
            super().__init__()
            weights = tv_models.MobileNet_V3_Small_Weights.DEFAULT
            model = tv_models.mobilenet_v3_small(weights=weights)
            self.features = model.features
            self.avgpool = model.avgpool
            self.eval()
            for p in self.parameters():
                p.requires_grad_(False)

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            """Extract feature vector.

            Args:
                x: [B, 3, H, W] tensor normalised with ImageNet stats.
            Returns:
                [B, D] feature vector.
            """
            f = self.features(x)
            f = self.avgpool(f)
            return f.flatten(1)


    class TrOCRAttackWrapper(nn.Module):
        """Wraps TrOCR vision encoder for adversarial attack.

        We maximise the encoder representation distortion, which
        disrupts downstream text decoding.
        """

        def __init__(
            self, model_name: str = "microsoft/trocr-small-printed"
        ):
            super().__init__()
            self._model_name = model_name
            # Only load the image processor (no tokenizer needed —
            # we only use the vision encoder, not the text decoder).
            self.image_processor = AutoImageProcessor.from_pretrained(
                model_name
            )
            full_model = VisionEncoderDecoderModel.from_pretrained(
                model_name
            )
            self.encoder = full_model.encoder
            # Free decoder memory — we only need the vision encoder
            del full_model.decoder
            self.eval()
            for p in self.parameters():
                p.requires_grad_(False)

        def forward(self, pixel_values: "torch.Tensor") -> "torch.Tensor":
            """Extract vision encoder features.

            Args:
                pixel_values: [B, 3, 384, 384] tensor.
            Returns:
                [B, seq_len, hidden_dim] encoder hidden states.
            """
            outputs = self.encoder(pixel_values=pixel_values)
            return outputs.last_hidden_state


    # -------------------------------------------------------------------
    # Helper nn.Modules for differentiable transforms
    # -------------------------------------------------------------------

    class _Resize(nn.Module):
        """Differentiable bilinear resize."""

        def __init__(self, size: int):
            super().__init__()
            self.size = size

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return F.interpolate(
                x, size=(self.size, self.size),
                mode="bilinear", align_corners=False,
            )

    class _Normalize(nn.Module):
        """Channel-wise normalisation."""

        def __init__(self, mean: List[float], std: List[float]):
            super().__init__()
            self.register_buffer(
                "mean", torch.tensor(mean).view(1, 3, 1, 1)
            )
            self.register_buffer(
                "std", torch.tensor(std).view(1, 3, 1, 1)
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return (x - self.mean) / self.std


    # -------------------------------------------------------------------
    # PGD Attack
    # -------------------------------------------------------------------

    class PGDAttack:
        """Projected Gradient Descent adversarial attack.

        Computes perturbations that maximise feature distortion in proxy
        models while remaining bounded within L-inf = epsilon.
        """

        def __init__(
            self,
            epsilon: float = 8 / 255,
            step_size: float = 1 / 255,
            steps: int = 10,
            jpeg_quality: int = 88,
        ):
            self.epsilon = epsilon
            self.step_size = step_size
            self.steps = steps
            self.jpeg_approx = DifferentiableJPEG(quality=jpeg_quality)

        def attack_tile(
            self,
            tile: "torch.Tensor",
            models: List,
            transforms: List,
            weights: List[float],
            use_jpeg_eot: bool = True,
        ) -> "torch.Tensor":
            """Run PGD on a single tile against an ensemble of models.

            Args:
                tile: [1, 3, H, W] tensor in [0, 1], the clean tile.
                models: List of proxy models to attack.
                transforms: Preprocessing transforms (one per model).
                weights: Loss weight for each model.
                use_jpeg_eot: Include JPEG approximation in loop.

            Returns:
                Perturbed tile [1, 3, H, W] in [0, 1].
            """
            tile = tile.clone().detach()

            # Pre-compute clean features for each model
            clean_features = []
            for model, transform in zip(models, transforms):
                with torch.no_grad():
                    clean_input = transform(tile)
                    clean_feat = model(clean_input)
                    clean_features.append(clean_feat.detach())

            # Initialise perturbation at zero
            perturbation = torch.zeros_like(tile)

            for step in range(self.steps):
                perturbation = perturbation.detach().requires_grad_(True)

                # Apply perturbation
                adv_tile = torch.clamp(tile + perturbation, 0.0, 1.0)

                # Simulate JPEG compression (EOT)
                if use_jpeg_eot:
                    adv_tile_c = self.jpeg_approx(adv_tile)
                else:
                    adv_tile_c = adv_tile

                # Compute ensemble loss: maximise feature distance
                total_loss = torch.tensor(0.0)
                for model, transform, clean_feat, w in zip(
                    models, transforms, clean_features, weights
                ):
                    adv_input = transform(adv_tile_c)
                    adv_feat = model(adv_input)

                    # Negative L2 — we MINIMISE this to MAXIMISE distance
                    feat_diff = adv_feat.flatten() - clean_feat.flatten()
                    loss = -torch.norm(feat_diff, p=2)
                    total_loss = total_loss + w * loss

                total_loss.backward()

                with torch.no_grad():
                    grad_sign = perturbation.grad.sign()
                    perturbation = perturbation - self.step_size * grad_sign

                    # Project onto L-inf ball
                    perturbation = torch.clamp(
                        perturbation, -self.epsilon, self.epsilon
                    )
                    # Ensure valid pixel range
                    perturbation = (
                        torch.clamp(tile + perturbation, 0.0, 1.0) - tile
                    )

            return torch.clamp(tile + perturbation.detach(), 0.0, 1.0)


# ---------------------------------------------------------------------------
# Main Engine
# ---------------------------------------------------------------------------

class AdversarialEngine:
    """High-level interface for computing adversarial perturbations.

    Handles model loading, tile splitting, and reassembly.

    Usage:
        engine = AdversarialEngine()
        perturbed = engine.attack(pil_image)
    """

    # Default tile size — matches typical vision model input
    TILE_SIZE = 224
    # Overlap between tiles to avoid seam artifacts
    TILE_OVERLAP = 32

    def __init__(
        self,
        epsilon: float = 8 / 255,
        step_size: float = 1 / 255,
        steps: int = 10,
        jpeg_quality: int = 88,
        use_trocr: bool = True,
        use_mobilenet: bool = True,
        trocr_weight: float = 0.6,
        mobilenet_weight: float = 0.4,
        verbose: bool = True,
    ):
        if not TORCH_AVAILABLE:
            raise ImportError(
                "PyTorch is required for adversarial perturbations.\n"
                "Install with: pip install torch torchvision\n"
                "Or use --attack none to skip (Tier 2 decoy text only)."
            )

        self.verbose = verbose
        self.epsilon = epsilon
        self.models: list = []
        self.transforms: list = []
        self.weights: List[float] = []

        # --- Load MobileNetV3 ---
        if use_mobilenet and TORCHVISION_AVAILABLE:
            if self.verbose:
                print("  [adv] Loading MobileNetV3-small ...",
                      end=" ", flush=True)
            mobilenet = MobileNetFeatureExtractor()
            self.models.append(mobilenet)

            mobilenet_transform = nn.Sequential(
                _Resize(224),
                _Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            )
            self.transforms.append(mobilenet_transform)
            self.weights.append(mobilenet_weight)
            if self.verbose:
                print("done", flush=True)

        # --- Load TrOCR-small ---
        if use_trocr and TROCR_AVAILABLE:
            if self.verbose:
                print("  [adv] Loading TrOCR-small ...",
                      end=" ", flush=True)
            trocr = TrOCRAttackWrapper("microsoft/trocr-small-printed")
            self.models.append(trocr)

            trocr_transform = nn.Sequential(
                _Resize(384),
                _Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
            )
            self.transforms.append(trocr_transform)
            self.weights.append(trocr_weight)
            if self.verbose:
                print("done", flush=True)

        if not self.models:
            raise RuntimeError(
                "No proxy models available. Install torchvision and/or "
                "transformers:\n  pip install torchvision transformers"
            )

        # Normalise weights
        total_w = sum(self.weights)
        self.weights = [w / total_w for w in self.weights]

        self.pgd = PGDAttack(
            epsilon=epsilon,
            step_size=step_size,
            steps=steps,
            jpeg_quality=jpeg_quality,
        )

        if self.verbose:
            model_names = []
            if use_mobilenet and TORCHVISION_AVAILABLE:
                model_names.append("MobileNetV3")
            if use_trocr and TROCR_AVAILABLE:
                model_names.append("TrOCR-small")
            print(
                f"  [adv] Ensemble ready: {'+'.join(model_names)}, "
                f"eps={epsilon * 255:.0f}/255, {steps} PGD steps"
            )

    def attack(self, image: Image.Image) -> Image.Image:
        """Compute adversarial perturbation for an entire page image.

        Splits the image into overlapping tiles, attacks each tile,
        then blends them back together with Hann windowing.

        Args:
            image: PIL Image (RGB) — a rasterised PDF page.

        Returns:
            Perturbed PIL Image (RGB), same size.
        """
        w, h = image.size
        tile_size = self.TILE_SIZE
        overlap = self.TILE_OVERLAP
        stride = tile_size - overlap

        # Convert to tensor [1, 3, H, W] in [0, 1]
        img_np = np.array(image, dtype=np.float32) / 255.0
        img_tensor = torch.from_numpy(img_np).permute(2, 0, 1).unsqueeze(0)

        # Output accumulator with blending weights
        output = torch.zeros_like(img_tensor)
        weight_map = torch.zeros(1, 1, h, w)

        # Generate tile grid positions
        tiles_y = list(range(0, max(1, h - tile_size + 1), stride))
        if not tiles_y:
            tiles_y = [0]
        if tiles_y[-1] + tile_size < h:
            tiles_y.append(max(0, h - tile_size))

        tiles_x = list(range(0, max(1, w - tile_size + 1), stride))
        if not tiles_x:
            tiles_x = [0]
        if tiles_x[-1] + tile_size < w:
            tiles_x.append(max(0, w - tile_size))

        # Deduplicate positions
        tiles_y = sorted(set(tiles_y))
        tiles_x = sorted(set(tiles_x))

        total_tiles = len(tiles_y) * len(tiles_x)
        tile_idx = 0

        # Pre-build Hann blending window
        blend_h = torch.hann_window(tile_size, periodic=False)
        blend_w = torch.hann_window(tile_size, periodic=False)
        blend_window = (
            blend_h.unsqueeze(1) * blend_w.unsqueeze(0)
        ).unsqueeze(0).unsqueeze(0)  # [1, 1, tile, tile]

        for ty in tiles_y:
            for tx in tiles_x:
                tile_idx += 1
                if self.verbose and (tile_idx % 50 == 1 or tile_idx == total_tiles):
                    print(
                        f"  [adv] tile {tile_idx}/{total_tiles}",
                        flush=True,
                    )

                # Handle edge tiles smaller than tile_size
                actual_h = min(tile_size, h - ty)
                actual_w = min(tile_size, w - tx)

                tile = img_tensor[:, :, ty:ty + actual_h, tx:tx + actual_w]

                # Pad small edge tiles to full tile_size for the model
                if actual_h < tile_size or actual_w < tile_size:
                    tile = F.pad(
                        tile,
                        (0, tile_size - actual_w, 0, tile_size - actual_h),
                        mode="reflect",
                    )

                # Skip near-uniform tiles (blank margins, white space)
                if tile.std() < 0.02:
                    adv_tile = tile
                else:
                    adv_tile = self.pgd.attack_tile(
                        tile,
                        self.models,
                        self.transforms,
                        self.weights,
                        use_jpeg_eot=True,
                    )

                # Crop back to actual size if we padded
                adv_tile = adv_tile[:, :, :actual_h, :actual_w]
                blend = blend_window[:, :, :actual_h, :actual_w]

                output[:, :, ty:ty + actual_h, tx:tx + actual_w] += (
                    adv_tile * blend
                )
                weight_map[:, :, ty:ty + actual_h, tx:tx + actual_w] += blend

        # Normalise by blending weights
        weight_map = torch.clamp(weight_map, min=1e-8)
        output = output / weight_map

        # Clamp final perturbation to respect epsilon globally
        delta = output - img_tensor
        delta = torch.clamp(delta, -self.epsilon, self.epsilon)
        output = torch.clamp(img_tensor + delta, 0.0, 1.0)

        # Convert back to PIL
        result_np = (
            output.squeeze(0).permute(1, 2, 0).numpy() * 255
        ).clip(0, 255).astype(np.uint8)
        return Image.fromarray(result_np)


# ---------------------------------------------------------------------------
# Convenience: check availability without instantiating
# ---------------------------------------------------------------------------

def is_available() -> bool:
    """Check if the adversarial engine can run (PyTorch installed)."""
    return TORCH_AVAILABLE


def get_status() -> str:
    """Return a human-readable status of available components."""
    parts = []
    parts.append(f"PyTorch: {'yes' if TORCH_AVAILABLE else 'NO'}")
    parts.append(f"torchvision: {'yes' if TORCHVISION_AVAILABLE else 'NO'}")
    parts.append(f"TrOCR: {'yes' if TROCR_AVAILABLE else 'NO'}")
    return " | ".join(parts)
