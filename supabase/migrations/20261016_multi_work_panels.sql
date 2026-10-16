-- Multi-panel support: each user can keep separate work-hour records for different people/employers.
-- Run this migration once in Supabase SQL Editor before using the updated app.

create table if not exists public.work_panels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'پنل اصلی',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.work_panels enable row level security;

-- Create one default panel per existing account, then attach all existing data to it.
insert into public.work_panels (user_id, name)
select u.id, 'پنل اصلی'
from auth.users u
where not exists (select 1 from public.work_panels p where p.user_id = u.id);

alter table public.work_entries add column if not exists panel_id uuid;
alter table public.monthly_rates add column if not exists panel_id uuid;

update public.work_entries e
set panel_id = p.id
from public.work_panels p
where p.user_id = e.user_id and e.panel_id is null;

update public.monthly_rates r
set panel_id = p.id
from public.work_panels p
where p.user_id = r.user_id and r.panel_id is null;

alter table public.work_entries alter column panel_id set not null;
alter table public.monthly_rates alter column panel_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_entries_panel_id_fkey') then
    alter table public.work_entries add constraint work_entries_panel_id_fkey
      foreign key (panel_id) references public.work_panels(id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'monthly_rates_panel_id_fkey') then
    alter table public.monthly_rates add constraint monthly_rates_panel_id_fkey
      foreign key (panel_id) references public.work_panels(id) on delete cascade;
  end if;
end $$;

alter table public.monthly_rates drop constraint if exists monthly_rates_user_month_unique;
create unique index if not exists monthly_rates_panel_month_unique on public.monthly_rates(panel_id, month_start);
create index if not exists work_entries_panel_date_idx on public.work_entries(panel_id, work_date);

drop policy if exists "work_panels_select_own" on public.work_panels;
create policy "work_panels_select_own" on public.work_panels for select using (auth.uid() = user_id);
drop policy if exists "work_panels_insert_own" on public.work_panels;
create policy "work_panels_insert_own" on public.work_panels for insert with check (auth.uid() = user_id);
drop policy if exists "work_panels_update_own" on public.work_panels;
create policy "work_panels_update_own" on public.work_panels for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "work_panels_delete_own" on public.work_panels;
create policy "work_panels_delete_own" on public.work_panels for delete using (auth.uid() = user_id);

drop policy if exists "monthly_rates_select_own" on public.monthly_rates;
drop policy if exists "monthly_rates_insert_own" on public.monthly_rates;
drop policy if exists "monthly_rates_update_own" on public.monthly_rates;
create policy "monthly_rates_select_own" on public.monthly_rates for select using (
  exists (select 1 from public.work_panels p where p.id = monthly_rates.panel_id and p.user_id = auth.uid())
);
create policy "monthly_rates_insert_own" on public.monthly_rates for insert with check (
  exists (select 1 from public.work_panels p where p.id = monthly_rates.panel_id and p.user_id = auth.uid())
);
create policy "monthly_rates_update_own" on public.monthly_rates for update using (
  exists (select 1 from public.work_panels p where p.id = monthly_rates.panel_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.work_panels p where p.id = monthly_rates.panel_id and p.user_id = auth.uid())
);

drop policy if exists "entries_select_own" on public.work_entries;
drop policy if exists "entries_insert_own" on public.work_entries;
drop policy if exists "entries_update_own" on public.work_entries;
drop policy if exists "entries_delete_own" on public.work_entries;
create policy "entries_select_own" on public.work_entries for select using (
  exists (select 1 from public.work_panels p where p.id = work_entries.panel_id and p.user_id = auth.uid())
);
create policy "entries_insert_own" on public.work_entries for insert with check (
  exists (select 1 from public.work_panels p where p.id = work_entries.panel_id and p.user_id = auth.uid())
);
create policy "entries_update_own" on public.work_entries for update using (
  exists (select 1 from public.work_panels p where p.id = work_entries.panel_id and p.user_id = auth.uid())
) with check (
  exists (select 1 from public.work_panels p where p.id = work_entries.panel_id and p.user_id = auth.uid())
);
create policy "entries_delete_own" on public.work_entries for delete using (
  exists (select 1 from public.work_panels p where p.id = work_entries.panel_id and p.user_id = auth.uid())
);

-- New accounts automatically receive their own default panel.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, hourly_rate) values (new.id, 0) on conflict (id) do nothing;
  insert into public.work_panels (user_id, name) values (new.id, 'پنل اصلی');
  return new;
end;
$$;

grant select, insert, update, delete on public.work_panels to authenticated;
grant select, insert, update, delete on public.work_entries to authenticated;
grant select, insert, update on public.monthly_rates to authenticated;
