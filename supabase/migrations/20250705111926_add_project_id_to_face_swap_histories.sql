-- Migration: Add project_id column to all main tables
-- Purpose: Track project association for all user and transaction records
-- Created: 2025-07-05 11:19:26 UTC

-- Add project_id to face_swap_histories
drop trigger if exists update_face_swap_history_updated_at_trigger on public.face_swap_histories;
alter table public.face_swap_histories
  add column if not exists project_id text not null default 'cybkmoqbwafrrbkeimpb';
comment on column public.face_swap_histories.project_id is 'Project identifier for multi-project support. Default: cybkmoqbwafrrbkeimpb';

-- Add project_id to credit_transaction
alter table public.credit_transaction
  add column if not exists project_id text not null default 'cybkmoqbwafrrbkeimpb';
comment on column public.credit_transaction.project_id is 'Project identifier for multi-project support. Default: cybkmoqbwafrrbkeimpb';

-- Add project_id to subscription_credits
alter table public.subscription_credits
  add column if not exists project_id text not null default 'cybkmoqbwafrrbkeimpb';
comment on column public.subscription_credits.project_id is 'Project identifier for multi-project support. Default: cybkmoqbwafrrbkeimpb';

-- Add project_id to user_credit_balance
alter table public.user_credit_balance
  add column if not exists project_id text not null default 'cybkmoqbwafrrbkeimpb';
comment on column public.user_credit_balance.project_id is 'Project identifier for multi-project support. Default: cybkmoqbwafrrbkeimpb';

-- Add project_id to user
alter table public."user"
  add column if not exists project_id text not null default 'cybkmoqbwafrrbkeimpb';
comment on column public."user".project_id is 'Project identifier for multi-project support. Default: cybkmoqbwafrrbkeimpb';

-- If you need to backfill existing rows, the default will apply automatically.
-- No destructive changes are made in this migration. 