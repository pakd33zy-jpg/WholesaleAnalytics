-- DealFlow Contract Maker storage
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  contract_type text not null default 'purchase' check (contract_type in ('purchase','assignment')),
  title text not null default 'Contract Draft',
  status text not null default 'draft' check (status in ('draft','ready','sent','signed','void')),
  seller_name text default '',
  buyer_name text default '',
  assignee_name text default '',
  property_address text default '',
  purchase_price numeric not null default 0,
  earnest_money numeric not null default 0,
  assignment_fee numeric not null default 0,
  closing_date date,
  inspection_days integer not null default 10,
  additional_terms text default '',
  document_text text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contracts enable row level security;

drop policy if exists "Users manage own contracts" on public.contracts;
create policy "Users manage own contracts"
on public.contracts for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists contracts_owner_updated_idx on public.contracts(owner_id, updated_at desc);
create index if not exists contracts_lead_idx on public.contracts(lead_id, updated_at desc);

drop trigger if exists trg_contracts_updated_at on public.contracts;
create trigger trg_contracts_updated_at
before update on public.contracts
for each row execute function public.set_updated_at();
