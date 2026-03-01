# HackIllinois — PDF Document Hardener

A hackathon prototype that applies subtle visual-hardening overlays to a PDF, adding OCR friction while **preserving selectable/copyable text**. The output PDF keeps all original text intact — you can still select and copy — but the visual noise layer makes automated scraping and OCR harder.

## Quick Start

```bash
pip install -r requirements.txt
python pdf_hardener.py --input doc.pdf --output hardened.pdf
```

## CLI Flags

| Flag | Description |
|------|-------------|
| `--input` / `-i` | Path to input PDF (required) |
| `--output` / `-o` | Output PDF path (default: `hardened.pdf`) |
| `--seed` | Integer seed for reproducibility (default: `42`) |
| `--safe-mode` | Use milder settings |
| `--strength` | Global multiplier `0.0`–`2.0` (default: `1.0`) |
| `--dpi` | Rasterisation DPI for page export & OCR eval (default: `300`) |
| `--overlay-dpi` | Resolution of hardening overlays (default: `150`). Lower = smaller file |
| `--eval-ocr` | Run Tesseract OCR before/after comparison |
| `--save-pages` | Rasterise hardened pages and save as PNGs |
| `--pages-dir` | Custom folder for saved pages |
| `--watermark-text` | Custom micro-watermark string |
| `--log-json` | Write a JSON log of all settings |

## Examples

```bash
# Default hardening
python pdf_hardener.py -i report.pdf -o report_hard.pdf

# Safe mode + save pages + JSON log
python pdf_hardener.py -i report.pdf -o report_hard.pdf --safe-mode --save-pages --log-json log.json

# Stronger transforms + OCR eval
python pdf_hardener.py -i report.pdf -o report_hard.pdf --strength 1.5 --eval-ocr
```

## Hardening Pipeline

All effects are applied as **transparent RGBA overlays** on top of the original PDF pages. The text layer is never rasterised or removed.

1. **Faint grain noise** — low-alpha dark specks across the page
2. **Micro-watermark overlay** — tiled, rotated, near-invisible text
3. **Micro-line pattern** — faint horizontal + diagonal lines
4. **Local contrast variation** — smooth spatially-varying tint overlay

All overlays are seeded per-page for full reproducibility.

## Dependencies

- Python 3.8+
- PyMuPDF (`fitz`), Pillow, NumPy
- Optional: `pytesseract` + Tesseract OCR for `--eval-ocr`
