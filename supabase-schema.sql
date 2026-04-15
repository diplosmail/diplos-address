-- Diplos Address - Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database

-- Campaigns table
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft', 'processing', 'complete', 'failed')),
  total_contacts int not null default 0,
  processed_count int not null default 0,
  created_at timestamptz not null default now()
);

-- Contacts table
create table contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  company_name text not null default '',
  company_url text not null default '',
  status text not null default 'pending' check (status in ('pending', 'scraping', 'verifying', 'complete', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_contacts_campaign_id on contacts(campaign_id);
create index idx_contacts_status on contacts(campaign_id, status);

-- Addresses table
create table addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  street_address text not null default '',
  street_address_2 text,
  city text not null default '',
  state_region text not null default '',
  postal_code text not null default '',
  country_region text not null default 'US',
  source text not null default 'website' check (source in ('website', 'google_maps', 'other')),
  source_url text,
  is_verified boolean not null default false,
  is_deliverable boolean not null default false,
  melissa_result jsonb,
  created_at timestamptz not null default now()
);

create index idx_addresses_contact_id on addresses(contact_id);

-- Export settings table
create table export_settings (
  id uuid primary key default gen_random_uuid(),
  column_name text not null,
  default_value text not null default '',
  column_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Enable RLS with permissive policies (no auth)
alter table campaigns enable row level security;
alter table contacts enable row level security;
alter table addresses enable row level security;
alter table export_settings enable row level security;

create policy "Allow all on campaigns" on campaigns for all using (true) with check (true);
create policy "Allow all on contacts" on contacts for all using (true) with check (true);
create policy "Allow all on addresses" on addresses for all using (true) with check (true);
create policy "Allow all on export_settings" on export_settings for all using (true) with check (true);

-- Function to atomically increment processed count
create or replace function increment_processed_count(campaign_id_input uuid)
returns void as $$
begin
  update campaigns
  set processed_count = processed_count + 1
  where id = campaign_id_input;
end;
$$ language plpgsql;
