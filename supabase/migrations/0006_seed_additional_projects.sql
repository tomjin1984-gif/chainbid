insert into categories (slug, name)
values
  ('ai-x-crypto', 'AI x Crypto'),
  ('tradfi', 'TradFi'),
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
  'uniswap',
  'uniswap.org',
  'Uniswap',
  'https://uniswap.org/',
  'Decentralized exchange protocol for token swaps and liquidity markets.',
  'DeFi',
  5,
  '2026-08-22T12:05:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'bittensor',
  'bittensor.com',
  'Bittensor',
  'https://bittensor.com/',
  'Open network for decentralized machine intelligence and tokenized AI markets.',
  'AI x Crypto',
  10,
  '2026-09-03T00:00:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'ethereum',
  'ethereum.org',
  'Ethereum',
  'https://ethereum.org/',
  'Layer one blockchain and smart contract platform for decentralized applications.',
  'L1',
  10,
  '2026-09-03T00:02:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'optimism',
  'optimism.io',
  'Optimism',
  'https://optimism.io/',
  'Ethereum layer two network and ecosystem built around the OP Stack.',
  'L2',
  10,
  '2026-09-03T00:03:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'chainlink',
  'chain.link',
  'Chainlink',
  'https://chain.link/',
  'Oracle infrastructure connecting smart contracts with off-chain data.',
  'Infrastructure',
  20,
  '2026-08-21T23:41:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'solana',
  'solana.com',
  'Solana',
  'https://solana.com/',
  'High-throughput layer one blockchain for consumer and financial applications.',
  'L1',
  10,
  '2026-08-20T17:18:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'arbitrum',
  'arbitrum.io',
  'Arbitrum',
  'https://arbitrum.io/',
  'Ethereum layer two ecosystem for scalable smart contract applications.',
  'L2',
  10,
  '2026-08-20T10:30:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'dogecoin',
  'dogecoin.com',
  'Dogecoin',
  'https://dogecoin.com/',
  'Open-source peer-to-peer digital currency with a large community.',
  'Memecoins',
  5,
  '2026-08-19T15:46:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'render-network',
  'rendernetwork.com',
  'Render Network',
  'https://rendernetwork.com/',
  'Decentralized GPU rendering and compute network for creators.',
  'DePIN',
  10,
  '2026-08-19T09:00:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'ondo-finance',
  'ondo.finance',
  'Ondo Finance',
  'https://ondo.finance/',
  'Tokenized real-world asset products and institutional on-chain finance.',
  'RWA',
  5,
  '2026-09-03T00:05:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'helium',
  'helium.com',
  'Helium',
  'https://www.helium.com/',
  'Decentralized wireless network for IoT and mobile connectivity.',
  'DePIN',
  5,
  '2026-09-03T00:04:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'polymarket',
  'polymarket.com',
  'Polymarket',
  'https://polymarket.com/',
  'Prediction market platform for trading event outcome probabilities.',
  'Prediction Markets',
  10,
  '2026-08-18T13:35:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'azuro',
  'azuro.org',
  'Azuro',
  'https://azuro.org/',
  'On-chain prediction market liquidity and tooling protocol.',
  'Prediction Markets',
  10,
  '2026-09-03T00:06:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'phantom',
  'phantom.com',
  'Phantom',
  'https://phantom.com/',
  'Crypto wallet for managing tokens, NFTs, and multi-chain apps.',
  'Wallets',
  10,
  '2026-08-18T08:12:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'binance',
  'binance.com',
  'Binance',
  'https://www.binance.com/',
  'Global crypto trading venue for spot, derivatives, and Web3 products.',
  'Trading',
  5,
  '2026-08-17T21:30:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'jupiter',
  'jup.ag',
  'Jupiter',
  'https://jup.ag/',
  'Solana liquidity aggregator for swaps, limit orders, and trading tools.',
  'DEX',
  10,
  '2026-08-17T16:24:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'pancakeswap',
  'pancakeswap.finance',
  'PancakeSwap',
  'https://pancakeswap.finance/',
  'Decentralized exchange for swaps, liquidity, and DeFi products.',
  'DEX',
  10,
  '2026-09-03T00:07:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'opensea',
  'opensea.io',
  'OpenSea',
  'https://opensea.io/',
  'Marketplace for NFTs, collectibles, and digital assets.',
  'NFT',
  10,
  '2026-08-17T10:45:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'blur',
  'blur.io',
  'Blur',
  'https://blur.io/',
  'NFT marketplace and trading platform for professional collectors.',
  'NFT',
  10,
  '2026-09-03T00:08:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'immutable',
  'immutable.com',
  'Immutable',
  'https://www.immutable.com/',
  'Web3 gaming platform and infrastructure for blockchain games.',
  'Gaming',
  10,
  '2026-09-03T00:09:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'lens',
  'lens.xyz',
  'Lens',
  'https://lens.xyz/',
  'Social graph and app ecosystem for on-chain social experiences.',
  'SocialFi',
  5,
  '2026-08-16T13:25:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'coinbase',
  'coinbase.com',
  'Coinbase',
  'https://www.coinbase.com/',
  'Crypto exchange, wallet, and on-chain application platform.',
  'Wallets',
  10,
  '2026-08-16T07:30:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'aave',
  'aave.com',
  'Aave',
  'https://aave.com/',
  'Decentralized liquidity protocol for borrowing and supplying assets.',
  'DeFi',
  10,
  '2026-09-03T00:01:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'celestia',
  'celestia.org',
  'Celestia',
  'https://celestia.org/',
  'Modular data availability network for rollups and app chains.',
  'Infrastructure',
  10,
  '2026-08-15T12:18:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'base',
  'base.org',
  'Base',
  'https://base.org/',
  'Ethereum layer two network built for consumer crypto applications.',
  'L2',
  10,
  '2026-08-14T20:52:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'zora',
  'zora.co',
  'Zora',
  'https://zora.co/',
  'On-chain creative network for minting and collecting media.',
  'NFT',
  5,
  '2026-08-14T09:16:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'okx',
  'okx.com',
  'OKX',
  'https://www.okx.com/',
  'Crypto exchange and Web3 platform for spot, derivatives, wallet, and DeFi access.',
  'Trading',
  30,
  '2026-09-04T00:00:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'robinhood',
  'robinhood.com',
  'Robinhood',
  'https://robinhood.com/',
  'Trading platform for stocks, crypto, options, and financial accounts.',
  'TradFi',
  25,
  '2026-09-04T00:01:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'kraken',
  'kraken.com',
  'Kraken',
  'https://www.kraken.com/',
  'Crypto exchange for spot trading, staking, futures, and institutional services.',
  'Trading',
  22,
  '2026-09-04T00:02:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'avalanche',
  'avax.network',
  'Avalanche',
  'https://www.avax.network/',
  'Layer one blockchain platform for custom networks and high-throughput applications.',
  'L1',
  20,
  '2026-09-04T00:03:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'sui',
  'sui.io',
  'Sui',
  'https://sui.io/',
  'Layer one blockchain designed for fast object-based smart contract applications.',
  'L1',
  19,
  '2026-09-04T00:04:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'polygon',
  'polygon.technology',
  'Polygon',
  'https://polygon.technology/',
  'Ethereum scaling ecosystem for proof-of-stake, zk, and app-chain infrastructure.',
  'L2',
  18,
  '2026-09-04T00:05:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'starknet',
  'starknet.io',
  'Starknet',
  'https://www.starknet.io/',
  'Ethereum layer two network using validity proofs for scalable smart contracts.',
  'L2',
  17,
  '2026-09-04T00:06:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'the-graph',
  'thegraph.com',
  'The Graph',
  'https://thegraph.com/',
  'Decentralized indexing protocol for querying blockchain data across networks.',
  'Infrastructure',
  16,
  '2026-09-04T00:07:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'filecoin',
  'filecoin.io',
  'Filecoin',
  'https://filecoin.io/',
  'Decentralized storage network for open data, applications, and verifiable storage.',
  'DePIN',
  15,
  '2026-09-04T00:08:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'akash-network',
  'akash.network',
  'Akash Network',
  'https://akash.network/',
  'Decentralized cloud compute marketplace for deploying applications and AI workloads.',
  'DePIN',
  14,
  '2026-09-04T00:09:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'lido',
  'lido.fi',
  'Lido',
  'https://lido.fi/',
  'Liquid staking protocol for Ethereum and other proof-of-stake networks.',
  'DeFi',
  13,
  '2026-09-04T00:10:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'makerdao',
  'makerdao.com',
  'MakerDAO',
  'https://makerdao.com/',
  'Decentralized credit protocol and stablecoin system for on-chain finance.',
  'DeFi',
  12,
  '2026-09-04T00:11:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'curve',
  'curve.fi',
  'Curve Finance',
  'https://curve.fi/',
  'Decentralized exchange focused on stablecoin swaps and deep liquidity markets.',
  'DEX',
  11,
  '2026-09-04T00:12:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'dydx',
  'dydx.exchange',
  'dYdX',
  'https://dydx.exchange/',
  'Decentralized exchange for perpetual futures and advanced crypto trading.',
  'DEX',
  10,
  '2026-09-04T00:13:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'magic-eden',
  'magiceden.io',
  'Magic Eden',
  'https://magiceden.io/',
  'NFT marketplace for collecting, minting, and trading digital assets across chains.',
  'NFT',
  10,
  '2026-09-04T00:14:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'axie-infinity',
  'axieinfinity.com',
  'Axie Infinity',
  'https://axieinfinity.com/',
  'Blockchain game ecosystem centered on collectible creatures, battles, and digital ownership.',
  'Gaming',
  9,
  '2026-09-04T00:15:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'farcaster',
  'farcaster.xyz',
  'Farcaster',
  'https://www.farcaster.xyz/',
  'Decentralized social protocol for user-owned identity and social applications.',
  'SocialFi',
  8,
  '2026-09-04T00:16:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'shiba-inu',
  'shibatoken.com',
  'Shiba Inu',
  'https://shibatoken.com/',
  'Community-driven memecoin ecosystem with tokens, DeFi, and NFT products.',
  'Memecoins',
  7,
  '2026-09-04T00:17:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'uma',
  'uma.xyz',
  'UMA',
  'https://uma.xyz/',
  'Optimistic oracle infrastructure used by prediction markets and on-chain applications.',
  'Prediction Markets',
  6,
  '2026-09-04T00:18:00Z'
);

select pg_temp.seed_chainbid_project_min_price(
  'centrifuge',
  'centrifuge.io',
  'Centrifuge',
  'https://centrifuge.io/',
  'Real-world asset protocol connecting credit markets with on-chain liquidity.',
  'RWA',
  5,
  '2026-09-04T00:19:00Z'
);
