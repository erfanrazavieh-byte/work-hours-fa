-- Run this once in Supabase SQL Editor to enable a separate hourly rate for each month.
create table if not exists public.monthly_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month_start date not null,
  hourly_rate numeric(14,2) not null default 0 check (hourly_rate >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_rates_user_month_unique unique (user_id, month_start)
);

alter table public.monthly_rates enable row level security;

drop policy if exists "monthly_rates_select_own" on public.monthly_rates;
create policy "monthly_rates_select_own"
  on public.monthly_rates for select
  using (auth.uid() = user_id);

drop policy if exists "monthly_rates_insert_own" on public.monthly_rates;
create policy "monthly_rates_insert_own"
  on public.monthly_rates for insert
  with check (auth.uid() = user_id);

drop policy if exists "monthly_rates_update_own" on public.monthly_rates;
create policy "monthly_rates_update_own"
  on public.monthly_rates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table public.monthly_rates to authenticated;
