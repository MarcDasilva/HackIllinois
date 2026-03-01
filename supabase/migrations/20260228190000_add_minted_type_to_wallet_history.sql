-- Allow type 'minted' in wallet_history for LAVA mint commits
alter table public.wallet_history
  drop constraint if exists wallet_history_type_check;

alter table public.wallet_history
  add constraint wallet_history_type_check
  check (type in ('transfer', 'receive', 'fee', 'other', 'minted'));
