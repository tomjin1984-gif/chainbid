insert into categories (slug, name)
values
  ('defi', 'DeFi'),
  ('infrastructure', 'Infrastructure'),
  ('l2', 'L2'),
  ('dex', 'DEX')
on conflict (slug) do update
set name = excluded.name;

create or replace function pg_temp.seed_chainbid_project_min_price(
  p_slug text,
  p_canonical_listing_key text,
  p_name text,
  p_url text,
  p_description text,
  p_category text,
  p_total_bid_usdt bigint,
  p_ranking_timestamp timestamptz
)
returns void
language plpgsql
as $$
declare
  existing_project_id uuid;
  existing_total_bid_usdt bigint;
  has_paid_bid boolean;
  effective_total_bid_usdt bigint;
begin
  select id, total_bid_usdt
    into existing_project_id, existing_total_bid_usdt
  from projects
  where slug = p_slug
     or canonical_listing_key = p_canonical_listing_key
  order by case when slug = p_slug then 0 else 1 end
  limit 1;

  if existing_project_id is null then
    insert into projects (
      slug,
      canonical_listing_key,
      name,
      url,
      description,
      category,
      total_bid_usdt,
      ranking_timestamp,
      status,
      created_at,
      updated_at,
      last_bid_at
    )
    values (
      p_slug,
      p_canonical_listing_key,
      p_name,
      p_url,
      p_description,
      p_category,
      p_total_bid_usdt,
      p_ranking_timestamp,
      'active',
      p_ranking_timestamp,
      now(),
      p_ranking_timestamp
    );
  else
    select exists (
      select 1
      from bids
      where project_id = existing_project_id
    )
      into has_paid_bid;

    effective_total_bid_usdt := case
      when has_paid_bid then greatest(existing_total_bid_usdt, p_total_bid_usdt)
      else p_total_bid_usdt
    end;

    update projects
    set slug = p_slug,
        canonical_listing_key = p_canonical_listing_key,
        name = p_name,
        url = p_url,
        description = p_description,
        category = p_category,
        total_bid_usdt = effective_total_bid_usdt,
        ranking_timestamp = case
          when not has_paid_bid or existing_total_bid_usdt <= p_total_bid_usdt then p_ranking_timestamp
          else ranking_timestamp
        end,
        status = 'active',
        updated_at = now(),
        last_bid_at = case
          when not has_paid_bid or existing_total_bid_usdt <= p_total_bid_usdt then p_ranking_timestamp
          else last_bid_at
        end
    where id = existing_project_id;
  end if;
end;
$$;

select pg_temp.seed_chainbid_project_min_price(
  'hyperliquid',
  'hyperliquid.xyz',
  'Hyperliquid',
  'https://hyperliquid.xyz/',
  'On-chain perpetual exchange and liquidity network for advanced crypto trading.',
  'DEX',
  34,
  '2026-09-04T08:00:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'eigenlayer',
  'eigenlayer.xyz',
  'EigenLayer',
  'https://www.eigenlayer.xyz/',
  'Ethereum restaking infrastructure for shared security and actively validated services.',
  'Infrastructure',
  29,
  '2026-09-04T08:01:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'pendle',
  'pendle.finance',
  'Pendle',
  'https://www.pendle.finance/',
  'DeFi protocol for tokenizing and trading future yield across crypto assets.',
  'DeFi',
  24,
  '2026-09-04T08:02:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'mantle',
  'mantle.xyz',
  'Mantle',
  'https://www.mantle.xyz/',
  'Ethereum layer two ecosystem for low-cost applications, liquidity, and on-chain products.',
  'L2',
  21,
  '2026-09-04T08:03:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'ethena',
  'ethena.fi',
  'Ethena',
  'https://ethena.fi/',
  'Synthetic dollar protocol and internet bond products built for crypto-native finance.',
  'DeFi',
  18,
  '2026-09-04T08:04:00Z'
);

delete from activity_events
where metadata ->> 'seedBatch' = '2026-09-04-add-five';

insert into activity_events (kind, project_id, payment_order_id, headline, metadata, created_at)
select
  seed.kind,
  projects.id,
  null,
  seed.headline,
  jsonb_build_object('developmentSeed', true, 'seedBatch', '2026-09-04-add-five'),
  seed.created_at
from (
  values
    ('rank_changed', 'hyperliquid', 'Hyperliquid took #1 - 34 USDT', '2026-09-04T08:00:00Z'::timestamptz),
    ('payment_credited', 'eigenlayer', 'EigenLayer entered Infrastructure - 29 USDT', '2026-09-04T08:01:00Z'::timestamptz),
    ('payment_credited', 'pendle', 'Pendle entered DeFi - 24 USDT', '2026-09-04T08:02:00Z'::timestamptz),
    ('payment_credited', 'mantle', 'Mantle entered L2 - 21 USDT', '2026-09-04T08:03:00Z'::timestamptz),
    ('payment_credited', 'ethena', 'Ethena entered DeFi - 18 USDT', '2026-09-04T08:04:00Z'::timestamptz)
) as seed(kind, slug, headline, created_at)
join projects on projects.slug = seed.slug;
