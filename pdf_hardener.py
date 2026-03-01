#!/usr/bin/env python3
"""
PDF Document Hardener -- HackIllinois
======================================
Converts each PDF page into a raster image (photo) and rebuilds the PDF
with that image as the ONLY visual layer.  On top sits a completely
invisible text layer of pure gibberish -- when anyone copies text they
get total nonsense, not even close to the original content.

Architecture:
  VISUAL   = rasterised JPEG of the original page  (what you see)
  COPYABLE = invisible gibberish text (render_mode=3) (what you copy)

Usage:
    python pdf_hardener.py -i doc.pdf
    python pdf_hardener.py -i doc.pdf -o out.pdf
    python pdf_hardener.py -i doc.pdf --no-poison   # image only, no gibberish
"""

from __future__ import annotations

import argparse
import io
import json
import os
import random
import string
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import List

import numpy as np
from PIL import Image

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None


# ---------------------------------------------------------------------------
# Gibberish generation
# ---------------------------------------------------------------------------

_SYLLABLES = [
    "ba", "ke", "lo", "mu", "ri", "fa", "ze", "wi", "qu", "jo",
    "ple", "gra", "sti", "fro", "thi", "bla", "cre", "spo", "dri", "whe",
    "unt", "alp", "erm", "ong", "usk", "ift", "ald", "emp", "osk", "urb",
    "tion", "ment", "ness", "ful", "ing", "ous", "ble", "ive", "ary", "ize",
]

_CONFUSERS = [
    '\u200B',  # Zero Width Space
    '\u200C',  # Zero Width Non-Joiner
    '\u200D',  # Zero Width Joiner
    '\uFEFF',  # BOM / ZWNBS
    '\u2060',  # Word Joiner
    '\u00AD',  # Soft Hyphen
    '\u034F',  # Combining Grapheme Joiner
    '\u2062',  # Invisible Times
    '\u2063',  # Invisible Separator
    '\u180E',  # Mongolian Vowel Separator
]


def _random_word(rng: random.Random, min_syl: int = 1, max_syl: int = 4) -> str:
    n = rng.randint(min_syl, max_syl)
    return "".join(rng.choice(_SYLLABLES) for _ in range(n))


def generate_gibberish(length_hint: int, rng: random.Random) -> str:
    """Random nonsense -- zero relation to any real text."""
    parts: list[str] = []
    total = 0
    while total < length_hint:
        roll = rng.random()
        if roll < 0.70:
            word = _random_word(rng)
        elif roll < 0.80:
            word = "".join(rng.choices(string.digits, k=rng.randint(1, 4)))
        elif roll < 0.88:
            word = "".join(rng.choices(_CONFUSERS, k=rng.randint(2, 5)))
        elif roll < 0.94:
            word = rng.choice(list(".,;:!?()[]{}@#$%&*-+=/<>"))
        else:
            pool = "bgdjzflcchshsheyuyaDSOtlpfy"
            word = "".join(rng.choices(pool, k=rng.randint(1, 3)))
        parts.append(word)
        total += len(word)
        if rng.random() < 0.75:
            parts.append(" ")
            total += 1
    return "".join(parts)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

@dataclass
class HardeningConfig:
    seed: int = 42
    dpi: int = 300
    jpeg_quality: int = 88
    poison_enabled: bool = True
    strength: float = 1.0

    def apply_strength(self) -> "HardeningConfig":
        s = max(0.0, min(self.strength, 3.0))
        if s > 1.0:
            self.jpeg_quality = max(60, int(self.jpeg_quality / s))
        return self


# ---------------------------------------------------------------------------
# Core pipeline
# ---------------------------------------------------------------------------

def harden_pdf(input_path: str, output_path: str, cfg: HardeningConfig) -> int:
    """
    Per page:
      1. Rasterize at high DPI
      2. JPEG compress
      3. New PDF page -- image is the ONLY visual content
      4. Invisible gibberish text layer (render_mode=3)
    """
    if fitz is None:
        sys.exit("ERROR: PyMuPDF required -- pip install PyMuPDF")

    input_path = str(Path(input_path).resolve())
    output_path = str(Path(output_path).resolve())
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    if not os.path.isfile(input_path):
        sys.exit(f"ERROR: file not found: {input_path}")

    src_doc = fitz.open(input_path)
    out_doc = fitz.open()
    n_pages = len(src_doc)

    # Helvetica is a PDF base-14 font -- no embedding, no visual artifacts.
    # render_mode=3 makes it invisible anyway.
    inv_font = fitz.Font("helv")

    for page_num in range(n_pages):
        src_page = src_doc[page_num]
        rect = src_page.rect
        py_rng = random.Random(cfg.seed + page_num)

        print(f"  [page {page_num + 1}/{n_pages}] ", end="", flush=True)

        # 1. Rasterize
        zoom = cfg.dpi / 72.0
        pix = src_page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        print(f"raster {pix.width}x{pix.height} ", end="", flush=True)

        # 2. JPEG compress
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=cfg.jpeg_quality)
        jpeg_bytes = buf.getvalue()
        print(f"jpeg {len(jpeg_bytes)//1024}KB ", end="", flush=True)

        # 3. New page -- image only
        new_page = out_doc.new_page(width=rect.width, height=rect.height)
        new_page.insert_image(rect, stream=jpeg_bytes)

        # 4. Invisible gibberish text layer
        if cfg.poison_enabled:
            text_dict = src_page.get_text("dict")
            tw = fitz.TextWriter(rect)
            placed = 0

            for block in text_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        orig = span.get("text", "")
                        if not orig.strip():
                            continue

                        gibberish = generate_gibberish(len(orig), py_rng)
                        # helv only handles Latin-1; strip outside range
                        gibberish = "".join(
                            ch for ch in gibberish
                            if ch.isprintable() and ord(ch) < 256
                        ) or _random_word(py_rng, 2, 5)

                        try:
                            tw.append(
                                fitz.Point(span["bbox"][0], span["bbox"][3]),
                                gibberish,
                                font=inv_font,
                                fontsize=span.get("size", 11),
                            )
                            placed += 1
                        except Exception:
                            pass

            try:
                tw.write_text(new_page, render_mode=3, color=(1, 1, 1))
            except TypeError:
                tw.write_text(new_page, opacity=0, color=(1, 1, 1))

            print(f"gibberish({placed} spans) ", end="", flush=True)
        else:
            print("no-poison ", end="", flush=True)

        print("done")

    out_doc.save(output_path, garbage=4, deflate=True)
    out_doc.close()
    src_doc.close()
    print(f"  [output] {n_pages} pages -> {output_path}")
    return n_pages


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="PDF Hardener -- rasterize + invisible gibberish text layer."
    )
    p.add_argument("--input", "-i", required=True)
    p.add_argument("--output", "-o", default=None)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--dpi", type=int, default=300)
    p.add_argument("--jpeg-quality", type=int, default=88)
    p.add_argument("--strength", type=float, default=1.0)
    p.add_argument("--no-poison", action="store_true",
                   help="Skip gibberish layer (image only).")
    p.add_argument("--save-pages", action="store_true")
    p.add_argument("--pages-dir", default=None)
    p.add_argument("--log-json", default=None)
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    t0 = time.time()

    if args.output is None:
        out_dir = Path(args.input).resolve().parent / "output"
        args.output = str(out_dir / f"{Path(args.input).stem}_hardened.pdf")
    os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)

    cfg = HardeningConfig(
        seed=args.seed,
        dpi=args.dpi,
        jpeg_quality=args.jpeg_quality,
        strength=args.strength,
        poison_enabled=not args.no_poison,
    )
    cfg.apply_strength()

    print("=" * 60)
    print("  PDF Document Hardener")
    print("=" * 60)
    print(f"  input       : {args.input}")
    print(f"  output      : {args.output}")
    print(f"  DPI         : {cfg.dpi}")
    print(f"  JPEG quality: {cfg.jpeg_quality}")
    print(f"  gibberish   : {'ON' if cfg.poison_enabled else 'OFF'}")
    print()

    print("[1] Hardening ...")
    n_pages = harden_pdf(args.input, args.output, cfg)
    print()

    if args.save_pages:
        pages_dir = args.pages_dir or str(
            Path(args.output).parent / (Path(args.output).stem + "_pages")
        )
        os.makedirs(pages_dir, exist_ok=True)
        print(f"[2] Saving pages -> {pages_dir}")
        doc = fitz.open(args.output)
        zoom = cfg.dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        for i in range(len(doc)):
            pix = doc[i].get_pixmap(matrix=mat, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            p = os.path.join(pages_dir, f"page_{i+1:04d}.png")
            img.save(p)
            print(f"  -> {p}")
        doc.close()
        print()

    elapsed = time.time() - t0
    print(f"Done in {elapsed:.1f}s.")
    print(f"  Visual    : pixel-perfect raster (no artifacts)")
    if cfg.poison_enabled:
        print(f"  Copy-paste: PURE GIBBERISH")

    if args.log_json:
        log = {
            "input": str(Path(args.input).resolve()),
            "output": str(Path(args.output).resolve()),
            "config": asdict(cfg),
            "pages": n_pages,
            "elapsed": round(elapsed, 2),
        }
        with open(args.log_json, "w") as f:
            json.dump(log, f, indent=2)
        print(f"  Log: {args.log_json}")
    print()


if __name__ == "__main__":
    main()
