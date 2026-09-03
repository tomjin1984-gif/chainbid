insert into categories (slug, name)
values
  ('ai-x-crypto', 'AI x Crypto'),
  ('defi', 'DeFi'),
  ('l1', 'L1'),
  ('l2', 'L2'),
  ('depin', 'DePIN'),
  ('rwa', 'RWA'),
  ('prediction-markets', 'Prediction Markets'),
  ('dex', 'DEX'),
  ('nft', 'NFT'),
  ('gaming', 'Gaming')
on conflict (slug) do update
set name = excluded.name;

create or replace function pg_temp.seed_chainbid_project(
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
begin
  select id
    into existing_project_id
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
    update projects
    set slug = p_slug,
        canonical_listing_key = p_canonical_listing_key,
        name = p_name,
        url = p_url,
        description = p_description,
        category = p_category,
        total_bid_usdt = p_total_bid_usdt,
        ranking_timestamp = p_ranking_timestamp,
        status = 'active',
        updated_at = now(),
        last_bid_at = p_ranking_timestamp
    where id = existing_project_id;
  end if;
end;
$$;

select pg_temp.seed_chainbid_project(
  'bittensor',
  'bittensor.com',
  'Bittensor',
  'https://bittensor.com/',
  'Open network for decentralized machine intelligence and tokenized AI markets.',
  'AI x Crypto',
  10,
  '2026-09-03T00:00:00Z'
);

select pg_temp.seed_chainbid_project(
  'aave',
  'aave.com',
  'Aave',
  'https://aave.com/',
  'Decentralized liquidity protocol for borrowing and supplying assets.',
  'DeFi',
  10,
  '2026-09-03T00:01:00Z'
);

select pg_temp.seed_chainbid_project(
  'ethereum',
  'ethereum.org',
  'Ethereum',
  'https://ethereum.org/',
  'Layer one blockchain and smart contract platform for decentralized applications.',
  'L1',
  10,
  '2026-09-03T00:02:00Z'
);

select pg_temp.seed_chainbid_project(
  'optimism',
  'optimism.io',
  'Optimism',
  'https://optimism.io/',
  'Ethereum layer two network and ecosystem built around the OP Stack.',
  'L2',
  10,
  '2026-09-03T00:03:00Z'
);

select pg_temp.seed_chainbid_project(
  'helium',
  'helium.com',
  'Helium',
  'https://www.helium.com/',
  'Decentralized wireless network for IoT and mobile connectivity.',
  'DePIN',
  5,
  '2026-09-03T00:04:00Z'
);

select pg_temp.seed_chainbid_project(
  'ondo-finance',
  'ondo.finance',
  'Ondo Finance',
  'https://ondo.finance/',
  'Tokenized real-world asset products and institutional on-chain finance.',
  'RWA',
  5,
  '2026-09-03T00:05:00Z'
);

select pg_temp.seed_chainbid_project(
  'azuro',
  'azuro.org',
  'Azuro',
  'https://azuro.org/',
  'On-chain prediction market liquidity and tooling protocol.',
  'Prediction Markets',
  10,
  '2026-09-03T00:06:00Z'
);

select pg_temp.seed_chainbid_project(
  'pancakeswap',
  'pancakeswap.finance',
  'PancakeSwap',
  'https://pancakeswap.finance/',
  'Decentralized exchange for swaps, liquidity, and DeFi products.',
  'DEX',
  10,
  '2026-09-03T00:07:00Z'
);

select pg_temp.seed_chainbid_project(
  'blur',
  'blur.io',
  'Blur',
  'https://blur.io/',
  'NFT marketplace and trading platform for professional collectors.',
  'NFT',
  10,
  '2026-09-03T00:08:00Z'
);

select pg_temp.seed_chainbid_project(
  'immutable',
  'immutable.com',
  'Immutable',
  'https://www.immutable.com/',
  'Web3 gaming platform and infrastructure for blockchain games.',
  'Gaming',
  10,
  '2026-09-03T00:09:00Z'
);
