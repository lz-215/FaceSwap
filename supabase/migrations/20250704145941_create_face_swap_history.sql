-- Migration: Create face_swap_histories table for storing face swap result metadata
-- Purpose: Store metadata for each face swap result, with images stored in Supabase Storage
-- Created: 2025-07-04 14:59:41 UTC

create table public.face_swap_histories (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  result_image_path text not null, -- Supabase Storage object path (e.g. face-swap/{user_id}/xxx.jpg)
  origin_image_url text,          -- Optional: original image URL or path
  description text,               -- Optional: user-provided or system-generated description
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.face_swap_histories is 'Stores metadata for each face swap result. Images are stored in Supabase Storage; this table tracks user, result image path (not public URL), and related info.';

-- Enable Row Level Security
alter table public.face_swap_histories enable row level security;

-- RLS Policy: Only authenticated users can select their own records
create policy "select_own_face_swap_history" on public.face_swap_histories
  for select
  using (auth.uid() = user_id);

-- RLS Policy: Only authenticated users can insert their own records
create policy "insert_own_face_swap_history" on public.face_swap_histories
  for insert
  with check (auth.uid() = user_id);

-- RLS Policy: Only authenticated users can update their own records
create policy "update_own_face_swap_history" on public.face_swap_histories
  for update
  using (auth.uid() = user_id);

-- RLS Policy: Only authenticated users can delete their own records
create policy "delete_own_face_swap_history" on public.face_swap_histories
  for delete
  using (auth.uid() = user_id);

-- Trigger: update updated_at on row modification
create or replace function public.update_face_swap_history_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger update_face_swap_history_updated_at_trigger
before update on public.face_swap_histories
for each row
execute function public.update_face_swap_history_updated_at();

-- For migration: rename result_image_url to result_image_path if upgrading an existing table
-- ALTER TABLE public.face_swap_histories RENAME COLUMN result_image_url TO result_image_path; 