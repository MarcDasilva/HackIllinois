-- Store content hash for mints so we can prevent double-mint
alter table public.wallet_history
  add column if not exists content_hash text;

create index if not exists wallet_history_content_hash_idx
  on public.wallet_history (content_hash)
  where type = 'minted';
