create extension if not exists "pgcrypto";

create type supported_network as enum ('tron', 'ethereum', 'bsc', 'solana');
create type project_status as enum ('pending', 'active', 'hidden', 'banned');
create type payment_order_status as enum (
  'created',
  'waiting',
  'detected',
  'confirming',
  'confirmed',
  'credited',
  'expired',
  'underpaid',
  'overpaid',
  'manual_review',
  'failed'
);
create type verification_status as enum (
  'not_found',
  'wrong_network',
  'wrong_token',
  'wrong_receiver',
  'wrong_amount',
  'wrong_sender',
  'failed_transaction',
  'unconfirmed',
  'confirmed',
  'manual_review',
  'provider_error'
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  canonical_listing_key text not null unique,
  name text not null,
  url text not null,
  description text not null default '',
  logo_url text,
  x_url text,
  category text not null references categories(name),
  total_bid_usdt bigint not null default 0 check (total_bid_usdt >= 0),
  ranking_timestamp timestamptz not null default now(),
  click_count bigint not null default 0 check (click_count >= 0),
  status project_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_bid_at timestamptz
);

create index projects_leaderboard_idx on projects (status, total_bid_usdt desc, ranking_timestamp asc);

create table payment_orders (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  project_id uuid not null references projects(id),
  bid_id uuid,
  network supported_network not null,
  receiver_address text not null,
  token_contract_or_mint text not null,
  bid_credit_usdt bigint not null check (bid_credit_usdt >= 1 and bid_credit_usdt <= 999999),
  expected_transfer_amount_atomic numeric(78, 0) not null,
  expected_transfer_amount_display text not null,
  expected_sender_address text,
  status payment_order_status not null default 'created',
  tx_hash text,
  block_number_or_slot text,
  confirmations integer not null default 0 check (confirmations >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  detected_at timestamptz,
  confirmed_at timestamptz,
  credited_at timestamptz,
  failure_reason text,
  unique (network, tx_hash)
);

create index payment_orders_status_idx on payment_orders (status, created_at);
create index payment_orders_project_idx on payment_orders (project_id);

create table bids (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  payment_order_id uuid not null unique references payment_orders(id),
  previous_total_usdt bigint not null check (previous_total_usdt >= 0),
  increment_usdt bigint not null check (increment_usdt >= 1),
  new_total_usdt bigint not null check (new_total_usdt >= increment_usdt),
  rank_before integer,
  rank_after integer,
  network supported_network not null,
  created_at timestamptz not null default now()
);

alter table payment_orders
  add constraint payment_orders_bid_id_fkey foreign key (bid_id) references bids(id);

create index bids_project_created_idx on bids (project_id, created_at desc);

create table blockchain_transactions (
  id uuid primary key default gen_random_uuid(),
  network supported_network not null,
  tx_hash text not null,
  token_contract_or_mint text,
  sender_address text,
  receiver_address text,
  amount_atomic numeric(78, 0),
  block_number_or_slot text,
  verification_status verification_status not null,
  first_seen_at timestamptz not null default now(),
  confirmed_at timestamptz,
  raw_reference text,
  unique (network, tx_hash)
);

create table activity_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  project_id uuid references projects(id),
  payment_order_id uuid references payment_orders(id),
  headline text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_created_idx on activity_events (created_at desc);

create table click_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id),
  ip_hash text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index click_events_project_created_idx on click_events (project_id, created_at desc);

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
before update on projects
for each row execute function touch_updated_at();

create or replace function credit_payment_order_atomic(order_public_id text)
returns table (credited boolean, payment_order jsonb, bid jsonb)
language plpgsql
security definer
as $$
declare
  locked_order payment_orders%rowtype;
  locked_project projects%rowtype;
  created_bid bids%rowtype;
  before_rank integer;
  after_rank integer;
  new_total bigint;
begin
  select * into locked_order
  from payment_orders
  where public_id = order_public_id
  for update;

  if not found then
    return query select false, null::jsonb, null::jsonb;
    return;
  end if;

  if locked_order.credited_at is not null then
    select * into created_bid from bids where id = locked_order.bid_id;
    return query select false, to_jsonb(locked_order), to_jsonb(created_bid);
    return;
  end if;

  if locked_order.status <> 'confirmed' then
    raise exception 'payment order % is not confirmed', order_public_id;
  end if;

  if locked_order.tx_hash is not null and exists (
    select 1 from payment_orders
    where network = locked_order.network
      and tx_hash = locked_order.tx_hash
      and public_id <> locked_order.public_id
      and credited_at is not null
  ) then
    raise exception 'transaction already credited';
  end if;

  select * into locked_project
  from projects
  where id = locked_order.project_id
  for update;

  if not found then
    raise exception 'project not found for order %', order_public_id;
  end if;

  select count(*) + 1 into before_rank
  from projects
  where status = 'active'
    and (
      total_bid_usdt > locked_project.total_bid_usdt
      or (
        total_bid_usdt = locked_project.total_bid_usdt
        and ranking_timestamp < locked_project.ranking_timestamp
      )
    );

  new_total := locked_project.total_bid_usdt + locked_order.bid_credit_usdt;

  update projects
  set total_bid_usdt = new_total,
      ranking_timestamp = now(),
      status = 'active',
      last_bid_at = now()
  where id = locked_project.id;

  select count(*) + 1 into after_rank
  from projects
  where status = 'active'
    and id <> locked_project.id
    and (
      total_bid_usdt > new_total
      or (
        total_bid_usdt = new_total
        and ranking_timestamp < now()
      )
    );

  insert into bids (
    project_id,
    payment_order_id,
    previous_total_usdt,
    increment_usdt,
    new_total_usdt,
    rank_before,
    rank_after,
    network
  )
  values (
    locked_project.id,
    locked_order.id,
    locked_project.total_bid_usdt,
    locked_order.bid_credit_usdt,
    new_total,
    before_rank,
    after_rank,
    locked_order.network
  )
  returning * into created_bid;

  update payment_orders
  set status = 'credited',
      credited_at = now(),
      bid_id = created_bid.id
  where id = locked_order.id
  returning * into locked_order;

  insert into activity_events (kind, project_id, payment_order_id, headline, metadata)
  values (
    'payment_credited',
    locked_project.id,
    locked_order.id,
    locked_project.name || ' raised its bid to ' || new_total::text || ' USDT',
    jsonb_build_object('rankBefore', before_rank, 'rankAfter', after_rank, 'network', locked_order.network)
  );

  return query select true, to_jsonb(locked_order), to_jsonb(created_bid);
end;
$$;

create or replace function record_project_click(p_target_project_id uuid, p_ip_hash text, p_user_agent text)
returns table (url text)
language plpgsql
security definer
as $$
declare
  target_url text;
  target_rank integer;
  click_increment integer;
begin
  select ranked.url, ranked.rank_position
  into target_url, target_rank
  from (
    select
      projects.id,
      projects.url,
      row_number() over (
        order by projects.total_bid_usdt desc, projects.ranking_timestamp asc
      )::integer as rank_position
    from projects
    where projects.status = 'active'
  ) ranked
  where ranked.id = p_target_project_id;

  if target_url is null then
    return;
  end if;

  click_increment := case
    when target_rank <= 3 then 15
    when target_rank <= 10 then 10
    when target_rank <= 20 then 5
    else 3
  end;

  insert into click_events (project_id, ip_hash, user_agent)
  values (p_target_project_id, p_ip_hash, left(coalesce(p_user_agent, ''), 500));

  update projects
  set click_count = click_count + click_increment::bigint,
      updated_at = now()
  where id = p_target_project_id;

  return query select target_url;
end;
$$;

insert into categories (slug, name) values
  ('ai-x-crypto', 'AI x Crypto'),
  ('defi', 'DeFi'),
  ('memecoins', 'Memecoins'),
  ('infrastructure', 'Infrastructure'),
  ('l1', 'L1'),
  ('l2', 'L2'),
  ('depin', 'DePIN'),
  ('rwa', 'RWA'),
  ('prediction-markets', 'Prediction Markets'),
  ('wallets', 'Wallets'),
  ('trading', 'Trading'),
  ('dex', 'DEX'),
  ('nft', 'NFT'),
  ('gaming', 'Gaming'),
  ('socialfi', 'SocialFi'),
  ('other', 'Other')
on conflict do nothing;
