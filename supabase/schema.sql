create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name text not null,
  property_address text not null,
  city text default '',
  source text default 'Manual',
  stage text not null default 'New'
    check (stage in ('New','Contacted','Qualified','Offer Sent','Under Contract','Closed')),
  score integer not null default 70 check (score between 0 and 100),
  arv numeric not null default 0,
  asking numeric not null default 0,
  repairs numeric not null default 0,
  mao numeric generated always as (greatest(0, arv * 0.70 - repairs)) stored,
  last_touch text default 'Never',
  next_action text default 'First contact',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_owner_id_idx on public.leads(owner_id);
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists leads_score_idx on public.leads(score desc);

alter table public.leads enable row level security;

drop policy if exists "Users can read own leads" on public.leads;
create policy "Users can read own leads"
on public.leads for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can insert own leads" on public.leads;
create policy "Users can insert own leads"
on public.leads for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Users can update own leads" on public.leads;
create policy "Users can update own leads"
on public.leads for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own leads" on public.leads;
create policy "Users can delete own leads"
on public.leads for delete
to authenticated
using (auth.uid() = owner_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();


-- CRM V2: tasks, outreach, offers, buyers

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  title text not null,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  created_at timestamptz not null default now()
);

create table if not exists public.outreach_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  channel text not null check (channel in ('call','sms','email','mail','other')),
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  status text not null default 'logged',
  body text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  amount numeric not null default 0,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','rejected','expired','withdrawn')),
  expires_at timestamptz,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  company text default '',
  email text default '',
  phone text default '',
  markets text[] not null default '{}',
  min_price numeric,
  max_price numeric,
  property_types text[] not null default '{}',
  proof_of_funds boolean not null default false,
  active boolean not null default true,
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.buyer_matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  buyer_id uuid not null references public.buyers(id) on delete cascade,
  status text not null default 'candidate'
    check (status in ('candidate','contacted','interested','passed','assigned')),
  created_at timestamptz not null default now(),
  unique(lead_id, buyer_id)
);

alter table public.tasks enable row level security;
alter table public.outreach_events enable row level security;
alter table public.offers enable row level security;
alter table public.buyers enable row level security;
alter table public.buyer_matches enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['tasks','outreach_events','offers','buyers','buyer_matches']
  loop
    execute format('drop policy if exists "Users manage own %1$s" on public.%1$s', t);
    execute format(
      'create policy "Users manage own %1$s" on public.%1$s for all to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id)',
      t
    );
  end loop;
end $$;

drop trigger if exists trg_offers_updated_at on public.offers;
create trigger trg_offers_updated_at
before update on public.offers
for each row execute function public.set_updated_at();

create index if not exists tasks_owner_due_idx on public.tasks(owner_id, due_at);
create index if not exists outreach_lead_idx on public.outreach_events(lead_id, created_at desc);
create index if not exists offers_lead_idx on public.offers(lead_id, created_at desc);
create index if not exists buyers_owner_active_idx on public.buyers(owner_id, active);
