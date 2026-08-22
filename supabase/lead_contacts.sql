create table if not exists public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  person_name text not null default '',
  phones jsonb not null default '[]'::jsonb,
  emails jsonb not null default '[]'::jsonb,
  mailing_addresses jsonb not null default '[]'::jsonb,
  provider text not null default 'RealEstateAPI',
  match_status text not null default 'best_match'
    check (match_status in ('best_match','needs_verification','no_match')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_contacts_owner_lead_idx
  on public.lead_contacts(owner_id, lead_id);

alter table public.lead_contacts enable row level security;

drop policy if exists lead_contacts_select_own on public.lead_contacts;
create policy lead_contacts_select_own on public.lead_contacts
for select to authenticated using (owner_id = auth.uid());

drop policy if exists lead_contacts_insert_own on public.lead_contacts;
create policy lead_contacts_insert_own on public.lead_contacts
for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists lead_contacts_update_own on public.lead_contacts;
create policy lead_contacts_update_own on public.lead_contacts
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists lead_contacts_delete_own on public.lead_contacts;
create policy lead_contacts_delete_own on public.lead_contacts
for delete to authenticated using (owner_id = auth.uid());
