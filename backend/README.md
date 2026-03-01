# LAVA Backend

Express API server: health, Google OAuth/Drive transfer, PDF and image hardening.

## Setup

```bash
cd backend
npm install
```

**Python deps (required for PDF/image hardening):**

Use a **virtual environment** so backend deps don’t conflict with other projects (numba, pandas, scipy, etc.):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Then run the Node server as usual (`npm run dev`). When you run hardening, the backend uses the same `python3` that’s on your PATH; if you use a venv, activate it in the same terminal before starting the server, or set the backend to use `backend/.venv/bin/python` when spawning the scripts.

Alternatively, in a shared environment:

```bash
pip install -r backend/requirements.txt
```

Copy `.env.example` to `.env` and set at least:

- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — required for `/transfer` and `/harden/*/by-id`
- `GOOGLE_*` — required for OAuth and Drive transfer

**Free mint (optional):** To enable **POST /mint/commit** (backend pays Solana tx fee, user signs in Phantom):

1. Install [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (or use an existing keypair).
2. Create a keypair (if you don’t have one):
   ```bash
   solana keypair new -o ~/.config/solana/id.json
   ```
3. Fund it on devnet:
   ```bash
   solana airdrop 1 --url devnet
   ```
4. In `backend/.env` set:
   ```
   SOLANA_RPC_URL=https://api.devnet.solana.com
   SOLANA_KEYPAIR_PATH=~/.config/solana/id.json
   ```
   Use a full path if `~` isn’t expanded (e.g. `/Users/you/.config/solana/id.json`).

Or copy from the project root `.env` if you already have one.

## Run

```bash
npm run dev    # ts-node (port 3001 by default)
# or
npm run build && npm run start
```

If `npm run dev` exits immediately in your terminal (prompt returns), run the compiled server instead: `npm run build && npm run start`. The server handles SIGINT/SIGTERM for a clean exit (Ctrl+C).

Default port is **3001** so the frontend can use 3000.

## Health check

```bash
curl http://localhost:3001/health
# => {"status":"ok","ts":"..."}
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness check |
| GET | /oauth/google?user_id=&lt;uuid&gt; | Start Google OAuth |
| GET | /oauth/callback | OAuth callback |
| POST | /transfer | Drive file transfer (JSON body) |
| POST | /harden/pdf | Harden PDFs (multipart `files[]`) |
| POST | /harden/pdf/by-id | Harden PDFs by storage file IDs (JSON) |
| POST | /harden/image | Harden images (multipart) |
| POST | /harden/image/by-id | Harden images by storage file IDs (JSON) |
| POST | /mint/commit | Free mint: backend pays fee, returns tx for user to sign (JSON: filename, content_hash, wallet?) |

## Python scripts

PDF/image hardening runs `pdf_hardener.py` and `image_hardener.py` from this folder. Install their dependencies first:

```bash
pip install -r backend/requirements.txt
```

Required: PyMuPDF, Pillow, numpy. Optional: torch/torchvision/transformers (for `--attack pgd`), pytesseract (for `--eval-ocr`).
