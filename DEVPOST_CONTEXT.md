# Velum / LAVA — Full Devpost Context

Use this document to answer judge questions, write your submission description, and prep for demos.

---

## 1. Project identity

- **Product name:** **Velum** (user-facing brand); **LAVA** (backend/oracle system name: **L**ava **A**greement **V**erification **A**pparatus or entropy oracle).
- **Tagline:** *"Identity stays Yours"* — documents and identity remain under your control; we provide verification and hardening, not custody.
- **One-liner:** Velum is a document identity platform that connects Google Drive to Solana: it lets you encrypt/harden PDFs and images in place, sync folders, and anchors document state to the chain via a privacy-preserving entropy oracle (only hashes are committed, never raw IDs).

---

## 2. What it does (elevator pitch)

- **For users:** Sign in with Google, connect Drive. Pick folders and turn on encryption; we download files, run PDF/image hardening (deterministic, seed-based), re-upload to the same Drive location. You can move files between folders via the app; all changes are reflected in a single source of truth (Supabase).
- **For the chain:** A separate **LAVA Entropy Oracle** (Node.js) runs on a timer (e.g. every 5s). Each tick it: (1) fetches Solana devnet state (slot, blockhash, ~100 token account states), (2) fetches document row IDs from Supabase, (3) computes a deterministic **SHA3-256 entropy seed** from tokens + doc IDs + chain data, (4) commits **only the hash** of the doc IDs on-chain via the **SPL Memo program** (raw IDs never leave the backend), (5) appends the commit to `data/commits.jsonl`. A **Verifier CLI** can check any transaction and validate the LAVA_V1 memo.
- **The Wall:** A public page (`/wall`) that reads active token accounts from Supabase (anon read) and displays a 10×3 grid of "lava lamp" placeholders. Tokens are shuffled deterministically every 5 minutes (epoch-based PRNG). It's a visual, shareable proof that the system is live and token state is in use.

---

## 3. Inspiration / problem

- **Document integrity and proof-of-existence:** Users want to prove that a set of documents existed at a point in time without exposing the documents or their IDs. Hashing and committing only the hash on-chain gives a public, verifiable commitment.
- **Google Drive as source of truth:** Many teams keep critical files in Drive. Velum adds encryption/hardening and optional on-chain anchoring without forcing a migration off Drive.
- **Solana for low-cost, high-throughput commitments:** Memo program (or a future custom program) gives cheap, permanent commitments and a clear audit trail (Explorer links).

---

## 4. What we built (features)

| Feature | Description |
|--------|--------------|
| **Google OAuth + Drive** | Sign in with Google (Supabase Auth). Backend stores tokens in `user_integrations`; Drive scope allows read/write for sync and transfer. |
| **Drive folder sync** | POST `/sync/folder`: list files in a Drive folder, download each PDF/image, run hardening (pdf_hardener.py / image_hardener.py), re-upload in place. Tracks per-folder and per-file encryption status in Supabase. |
| **Drive folder settings** | Per-folder: enable/disable encryption, trigger (on_update / daily / hourly), content types (images / PDFs / both), allowed viewer emails. Last encrypted timestamp and success/failure. |
| **Transfer** | POST `/transfer`: move a document's Drive file to another folder; updates `documents.drive_folder_id` and related fields. |
| **PDF/Image hardening** | Backend calls Python scripts (`pdf_hardener.py`, `image_hardener.py`) with optional seed. Supports multipart upload or by-id (Supabase storage). Used by sync and by direct API. |
| **LAVA Entropy Oracle** | Standalone process (root `npm run dev`): every N seconds, fetches Supabase doc IDs + Solana snapshot, computes SHA3-256 entropy, sends Memo tx, appends to `commits.jsonl`. |
| **Verifier CLI** | `npm run verify -- <signature>`: fetches tx, parses LAVA_V1 memo, prints slot, blockhash, tokens hash, docs hash, doc count, entropy seed; validates format. |
| **The Wall** | Public `/wall`: 10×3 grid of lava lamp GIFs; each cell maps to a token from `token_accounts` (anon read). Seeded shuffle every 5 min; hover shows token id + created_at. |
| **Dashboard** | Auth-required: main dashboard and hierarchy view; Solana wallet provider; Drive folder settings panel (sync, encryption options, file-level encryption status). |

---

## 5. How we built it (tech stack & architecture)

### Frontend
- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Supabase** (Auth + Postgres + Storage via `@supabase/supabase-js`, `@supabase/ssr`)
- **Solana:** `@solana/wallet-adapter-*`, `@solana/web3.js` for wallet connect (dashboard)
- **UI:** Tailwind, Radix/shadcn, Framer Motion, Lenis (smooth scroll), custom metallic paint effect on logo
- **Routes:** `/` (landing; redirect to `/dashboard` if signed in), `/wall` (public), `/dashboard`, `/dashboard/hierarchy`, `/auth/callback`

### Backend (LAVA API)
- **Node.js, Express 5, TypeScript**
- **Endpoints:** `GET /health`, `GET /oauth/google?user_id=`, `GET /oauth/callback`, `POST /transfer`, `POST /harden/pdf`, `POST /harden/pdf/by-id`, `POST /harden/image`, `POST /harden/image/by-id`, `POST /sync/folder`
- **Google:** `googleapis` (Drive), OAuth flow; tokens in Supabase `user_integrations`
- **Supabase:** service role for server-side DB and storage
- **Hardening:** spawns Python (`pdf_hardener.py`, `image_hardener.py`) from backend dir; optional `.venv`; temp dirs for in/out files

### Oracle (root)
- **Node.js, TypeScript** (same repo root)
- **Solana:** `@solana/web3.js`, `@solana/spl-token`; SPL Memo program for commits
- **Supabase:** service role to read `documents` (ID column) and `token_accounts` (pubkeys)
- **Entropy:** SHA3-256 (Node crypto); stable stringify for token state; doc IDs sorted, joined, hashed (never sent raw)
- **Persistence:** `data/commits.jsonl` (append-only)

### Database (Supabase / Postgres)
- **documents:** id, title, content, owner_id, metadata, status; Drive columns: drive_file_id, drive_folder_id, mime_type, transfer_status, transfer_target_folder_id, transfer_error, transferred_at
- **user_integrations:** user_id, provider, access_token, refresh_token, token_expires_at, google_email
- **token_accounts:** id, pubkey (unique), is_active, source, created_at; RLS: authenticated read + anon read for `is_active = true` (Wall)
- **drive_folder_settings:** user_id, drive_folder_id, drive_folder_name, is_encrypted, encrypt_trigger, encrypt_content_types, allowed_viewer_emails, last_encrypted_at, last_encryption_success
- **drive_file_encryption_status:** user_id, drive_file_id, last_encrypted_at, last_encryption_success
- **organizations,** **wallets,** **wallet_history,** **storage_files** (migrations present for org/wallet/file storage)

### Entropy algorithm (for judges)
1. **Token state:** sort token accounts by pubkey, stable-stringify array → `tokens_state_hash = SHA3-256(json)`.
2. **Document IDs:** sort UUIDs, join with `|` → `docs_hash = SHA3-256(docs_canonical)`. Raw IDs never leave the oracle process.
3. **Seed:** `entropy_seed = SHA3-256(tokens_state_hash | docs_hash | slot | blockhash)`.
4. Memo payload: `LAVA_V1|slot=...|blockhash=...|tokens=...|docs=...|n=<count>|seed=...`.

---

## 6. Challenges & accomplishments

- **Privacy:** Designing so only hashes go on-chain; doc IDs stay server-side and are never logged in the memo.
- **Drive + Supabase:** Keeping OAuth tokens secure (Supabase RLS, service role only on backend), and syncing Drive state with Supabase (folder/file encryption status) so the UI and oracle stay consistent.
- **Determinism:** Stable stringify and sorted IDs so the same inputs always produce the same entropy and memo; verifier can reproduce expectations.
- **Public Wall:** Anon read on `token_accounts` so `/wall` works without login; seeded shuffle so the grid is stable per 5-minute epoch.

---

## 7. What's next

- Replace SPL Memo with a **custom Solana program** (e.g. Anchor) for structured commitment accounts and optional verification logic.
- **Scheduled sync:** Honor `encrypt_trigger` (daily/hourly) via cron or background jobs that call `POST /sync/folder`.
- **Content hash in wallet_history** (migration exists): link on-chain commits to user-facing "mint" or proof events.
- **Mainnet:** Move oracle and frontend to mainnet when ready (RPC, keypair, env).

---

## 8. Quick Q&A for judges

**What is Velum?**  
A document identity platform that lets you encrypt/harden Google Drive files (PDFs and images) and anchor their state to Solana via a privacy-preserving entropy oracle. Only hashes are committed on-chain; your documents and their IDs stay private.

**What is the LAVA oracle?**  
A separate Node process that periodically (e.g. every 5 seconds) reads document IDs from Supabase and Solana token state, computes a deterministic SHA3-256 entropy seed, and commits a single hash of the doc set on-chain using the SPL Memo program. Raw document IDs never leave the server.

**Why Solana?**  
Cheap, fast finality, and a simple Memo program (or custom program) for permanent, verifiable commitments. Explorer gives shareable links for every commit.

**Why Google Drive?**  
Many users already keep important documents in Drive. Velum adds encryption and on-chain proof without replacing Drive as the primary store.

**What is "hardening"?**  
Running PDF and image files through Python scripts that apply deterministic transformations (e.g. seed-based) so the content is tied to a known process; we re-upload the result back to Drive.

**What is The Wall?**  
A public page that displays a grid of "lava lamps" backed by active token accounts in the DB. It's a visual, shareable proof that the system is live and that token state is being used (and can be read anonymously).

**How do you verify a commit?**  
Run `npm run verify -- <transaction-signature>`. The script fetches the tx, parses the LAVA_V1 memo, and prints and validates slot, blockhash, tokens hash, docs hash, doc count, and entropy seed.

**Where is the code?**  
Monorepo: root = oracle + verifier; `frontend/` = Next.js app (landing, wall, dashboard); `backend/` = Express API (OAuth, transfer, hardening, sync). Supabase migrations in `supabase/migrations/`.

---

## 9. Demo / run instructions

- **Landing:** Open `/`; "Sign in with Google" → redirect to Google → callback → dashboard.
- **Wall:** Open `/wall` (no login); see 10×3 grid and clock; hover cells for token id + timestamp.
- **Dashboard:** After login, use dashboard and hierarchy; open a Drive folder's settings → set encryption options, run "Sync" to trigger `POST /sync/folder`.
- **Backend:** `cd backend && npm run dev` (default port 3001). Set `NEXT_PUBLIC_LAVA_API_URL` in frontend if not localhost:3001.
- **Oracle:** From repo root, set `.env` (Supabase, Solana RPC, keypair path, `ENTROPY_INTERVAL_MS`), then `npm run dev`. Commits go to `data/commits.jsonl` and Solana devnet.
- **Verifier:** `npm run verify -- <tx-signature>` (from repo root).

---

## 10. Repo layout (high level)

```
HackIllinois/
├── package.json          # root: oracle scripts, dev:server, dev:client, verify
├── src/                  # LAVA oracle: index.ts, solana.ts, snapshot.ts, entropy.ts, memoCommit.ts, supabase.ts, verifyMemo.ts
├── data/                 # commits.jsonl (git-ignored)
├── frontend/             # Next.js app (wall, dashboard, landing)
├── backend/              # Express API (Drive, OAuth, harden, sync)
└── supabase/migrations/  # documents, user_integrations, token_accounts, drive_folder_settings, drive_file_encryption_status, etc.
```

Use this doc to fill out Devpost fields and answer live questions.
