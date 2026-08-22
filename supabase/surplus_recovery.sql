-- DealFlow Surplus Recovery storage
create table if not exists public.surplus_cases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  claimant_name text not null,
  property_address text not null default '',
  county text not null default '',
  state text not null default 'CA',
  parcel_number text not null default '',
  case_number text not null default '',
  claimant_phone text not null default '',
  claimant_email text not null default '',
  mailing_address text not null default '',
  sale_date date,
  claim_deadline date,
  surplus_amount numeric not null default 0 check (surplus_amount >= 0),
  fee_percent numeric not null default 25 check (fee_percent >= 0 and fee_percent <= 100),
  status text not null default 'new' check (status in ('new','verified','contacting','contracted','claim_filed','approved','paid','closed','lost')),
  source text not null default '',
  source_url text not null default '',
  next_action text not null default 'Verify surplus',
  notes text not null default '',
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.surplus_cases enable row level security;
drop policy if exists "Users manage own surplus cases" on public.surplus_cases;
create policy "Users manage own surplus cases" on public.surplus_cases for all to authenticated
using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create index if not exists surplus_cases_owner_updated_idx on public.surplus_cases(owner_id, updated_at desc);
create index if not exists surplus_cases_status_idx on public.surplus_cases(owner_id, status, updated_at desc);
create index if not exists surplus_cases_deadline_idx on public.surplus_cases(owner_id, claim_deadline);
drop trigger if exists trg_surplus_cases_updated_at on public.surplus_cases;
create trigger trg_surplus_cases_updated_at before update on public.surplus_cases
for each row execute function public.set_updated_at();
