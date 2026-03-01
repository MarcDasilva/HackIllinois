# Velum

**Identity stays Yours.**

Velum is a document identity platform that hardens PDFs and images against AI extraction, syncs with Google Drive, and anchors document state to the Solana blockchain via a privacy-preserving entropy oracle. Documents look identical to the human eye but become unreadable to any AI system.

---

## How It Works

1. **Sign in with Google** and connect your Drive folders.
2. **Harden** — PDFs and images are processed through adversarial pipelines (pixel noise, decoy text overlays, gibberish copy layers, UAP perturbations) that defeat AI extraction while preserving human readability.
3. **Sync** — Hardened files are re-uploaded to the same Drive location. Per-folder encryption settings control when and what gets processed.
4. **Anchor** — The LAVA entropy oracle commits a SHA3-256 hash of document state + Solana token state on-chain every 5 seconds via the SPL Memo program. Raw document IDs never leave the server.
5. **Verify** — Any commit can be verified against the Solana blockchain using the included CLI.

---

## Architecture

| Layer | Stack |
|-------|-------|
| **Frontend** | Next.js, React, TypeScript, Tailwind, Supabase Auth |
| **Backend API** | Node.js, Express, TypeScript, Google Drive API |
| **Hardening** | Python (PyMuPDF, Pillow, NumPy, optional PyTorch for PGD attacks) |
| **Oracle** | Node.js, Solana web3.js, SPL Memo, SHA3-256 |
| **Database** | Supabase (Postgres + Auth + Storage) |
| **Chain** | Solana devnet |

---

## Quick Start

```bash
# Frontend
cd frontend && npm install && npm run dev

# Backend API (port 3001)
cd backend && npm install && npm run dev

# Oracle (from repo root)
npm install && npm run dev
```

Configure `.env` files in root, `frontend/`, and `backend/` (see `.env.example` files).

---

## Key Features

- **AI-proof document hardening** — Multi-layer pipeline: rasterization, pixel noise, prompt injection overlays, gibberish text layers, UAP perturbations, EXIF poisoning
- **Google Drive integration** — OAuth sign-in, folder sync, per-folder encryption settings
- **On-chain commitment** — Deterministic entropy seed from Solana state + document IDs, committed via SPL Memo
- **The Wall** — Public `/wall` page displaying live token state as a visual proof-of-liveness grid
- **Sync history** — Full audit log of every file sync with timestamps and success/failure status
- **Verifier CLI** — `npm run verify -- <tx-signature>` to validate any on-chain commit

---

## License

MIT
