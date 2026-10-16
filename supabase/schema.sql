-- Run this script in Supabase SQL Editor.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hourly_rate numeric(14,2) not null default 0 check (hourly_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_entries_user_date_idx on public.work_entries(user_id, work_date);
alter table public.profiles enable row level security;
alter table public.work_entries enable row level security;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "entries_select_own" on public.work_entries;
create policy "entries_select_own" on public.work_entries for select using (auth.uid() = user_id);
drop policy if exists "entries_insert_own" on public.work_entries;
create policy "entries_insert_own" on public.work_entries for insert with check (auth.uid() = user_id);
drop policy if exists "entries_update_own" on public.work_entries;
create policy "entries_update_own" on public.work_entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "entries_delete_own" on public.work_entries;
create policy "entries_delete_own" on public.work_entries for delete using (auth.uid() = user_id);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id, hourly_rate) values (new.id, 0) on conflict (id) do nothing; return new; end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();