export type Category =
  | "All"
  | "AI x Crypto"
  | "TradFi"
  | "DeFi"
  | "Memecoins"
  | "Infrastructure"
  | "L1"
  | "L2"
  | "DePIN"
  | "RWA"
  | "Prediction Markets"
  | "Wallets"
  | "Trading"
  | "DEX"
  | "NFT"
  | "Gaming"
  | "SocialFi"
  | "Other";

export interface LeaderboardProject {
  id: string;
  slug: string;
  name: string;
  domain: string;
  url: string;
  description: string;
  category: Exclude<Category, "All">;
  totalBidUsdt: number;
  rankingTimestamp: string;
  clickCount: number;
  logoText: string;
  previousRank?: number;
}

export const categories: Category[] = [
  "All",
  "AI x Crypto",
  "TradFi",
  "DeFi",
  "Memecoins",
  "Infrastructure",
  "L1",
  "L2",
  "DePIN",
  "RWA",
  "Prediction Markets",
  "Wallets",
  "Trading",
  "DEX",
  "NFT",
  "Gaming",
  "SocialFi",
  "Other",
];

export const developmentProjects: LeaderboardProject[] = [
  {
    id: "uniswap",
    slug: "uniswap",
    name: "Uniswap",
    domain: "uniswap.org",
    url: "https://uniswap.org",
    description: "Decentralized exchange protocol for token swaps and liquidity markets.",
    category: "DeFi",
    totalBidUsdt: 14023,
    rankingTimestamp: "2026-08-22T12:05:00.000Z",
    clickCount: 48210,
    logoText: "UN",
    previousRank: 2,
  },
  {
    id: "bittensor",
    slug: "bittensor",
    name: "Bittensor",
    domain: "bittensor.com",
    url: "https://bittensor.com",
    description: "Open network for decentralized machine intelligence and tokenized AI markets.",
    category: "AI x Crypto",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:00:00.000Z",
    clickCount: 0,
    logoText: "TA",
    previousRank: 1,
  },
  {
    id: "ethereum",
    slug: "ethereum",
    name: "Ethereum",
    domain: "ethereum.org",
    url: "https://ethereum.org",
    description: "Layer one blockchain and smart contract platform for decentralized applications.",
    category: "L1",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:02:00.000Z",
    clickCount: 0,
    logoText: "ETH",
  },
  {
    id: "optimism",
    slug: "optimism",
    name: "Optimism",
    domain: "optimism.io",
    url: "https://optimism.io",
    description: "Ethereum layer two network and ecosystem built around the OP Stack.",
    category: "L2",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:03:00.000Z",
    clickCount: 0,
    logoText: "OP",
  },
  {
    id: "chainlink",
    slug: "chainlink",
    name: "Chainlink",
    domain: "chain.link",
    url: "https://chain.link",
    description: "Oracle infrastructure connecting smart contracts with off-chain data.",
    category: "Infrastructure",
    totalBidUsdt: 12100,
    rankingTimestamp: "2026-08-21T23:41:00.000Z",
    clickCount: 21109,
    logoText: "CL",
    previousRank: 4,
  },
  {
    id: "solana",
    slug: "solana",
    name: "Solana",
    domain: "solana.com",
    url: "https://solana.com",
    description: "High-throughput layer one blockchain for consumer and financial applications.",
    category: "L1",
    totalBidUsdt: 11400,
    rankingTimestamp: "2026-08-20T17:18:00.000Z",
    clickCount: 17640,
    logoText: "SOL",
  },
  {
    id: "arbitrum",
    slug: "arbitrum",
    name: "Arbitrum",
    domain: "arbitrum.io",
    url: "https://arbitrum.io",
    description: "Ethereum layer two ecosystem for scalable smart contract applications.",
    category: "L2",
    totalBidUsdt: 9800,
    rankingTimestamp: "2026-08-20T10:30:00.000Z",
    clickCount: 15502,
    logoText: "ARB",
  },
  {
    id: "dogecoin",
    slug: "dogecoin",
    name: "Dogecoin",
    domain: "dogecoin.com",
    url: "https://dogecoin.com",
    description: "Open-source peer-to-peer digital currency with a large community.",
    category: "Memecoins",
    totalBidUsdt: 8700,
    rankingTimestamp: "2026-08-19T15:46:00.000Z",
    clickCount: 10118,
    logoText: "DOGE",
  },
  {
    id: "render",
    slug: "render-network",
    name: "Render Network",
    domain: "rendernetwork.com",
    url: "https://rendernetwork.com",
    description: "Decentralized GPU rendering and compute network for creators.",
    category: "DePIN",
    totalBidUsdt: 8200,
    rankingTimestamp: "2026-08-19T09:00:00.000Z",
    clickCount: 8920,
    logoText: "RN",
  },
  {
    id: "ondo",
    slug: "ondo-finance",
    name: "Ondo Finance",
    domain: "ondo.finance",
    url: "https://ondo.finance",
    description: "Tokenized real-world asset products and institutional on-chain finance.",
    category: "RWA",
    totalBidUsdt: 5,
    rankingTimestamp: "2026-09-03T00:05:00.000Z",
    clickCount: 0,
    logoText: "ONDO",
  },
  {
    id: "helium",
    slug: "helium",
    name: "Helium",
    domain: "helium.com",
    url: "https://www.helium.com",
    description: "Decentralized wireless network for IoT and mobile connectivity.",
    category: "DePIN",
    totalBidUsdt: 5,
    rankingTimestamp: "2026-09-03T00:04:00.000Z",
    clickCount: 0,
    logoText: "HNT",
  },
  {
    id: "polymarket",
    slug: "polymarket",
    name: "Polymarket",
    domain: "polymarket.com",
    url: "https://polymarket.com",
    description: "Prediction market platform for trading event outcome probabilities.",
    category: "Prediction Markets",
    totalBidUsdt: 6750,
    rankingTimestamp: "2026-08-18T13:35:00.000Z",
    clickCount: 6980,
    logoText: "PM",
  },
  {
    id: "azuro",
    slug: "azuro",
    name: "Azuro",
    domain: "azuro.org",
    url: "https://azuro.org",
    description: "On-chain prediction market liquidity and tooling protocol.",
    category: "Prediction Markets",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:06:00.000Z",
    clickCount: 0,
    logoText: "AZ",
  },
  {
    id: "phantom",
    slug: "phantom",
    name: "Phantom",
    domain: "phantom.com",
    url: "https://phantom.com",
    description: "Crypto wallet for managing tokens, NFTs, and multi-chain apps.",
    category: "Wallets",
    totalBidUsdt: 6100,
    rankingTimestamp: "2026-08-18T08:12:00.000Z",
    clickCount: 6592,
    logoText: "PH",
  },
  {
    id: "binance",
    slug: "binance",
    name: "Binance",
    domain: "binance.com",
    url: "https://www.binance.com",
    description: "Global crypto trading venue for spot, derivatives, and Web3 products.",
    category: "Trading",
    totalBidUsdt: 5650,
    rankingTimestamp: "2026-08-17T21:30:00.000Z",
    clickCount: 6120,
    logoText: "BN",
  },
  {
    id: "jupiter",
    slug: "jupiter",
    name: "Jupiter",
    domain: "jup.ag",
    url: "https://jup.ag",
    description: "Solana liquidity aggregator for swaps, limit orders, and trading tools.",
    category: "DEX",
    totalBidUsdt: 4890,
    rankingTimestamp: "2026-08-17T16:24:00.000Z",
    clickCount: 5774,
    logoText: "JUP",
  },
  {
    id: "pancakeswap",
    slug: "pancakeswap",
    name: "PancakeSwap",
    domain: "pancakeswap.finance",
    url: "https://pancakeswap.finance",
    description: "Decentralized exchange for swaps, liquidity, and DeFi products.",
    category: "DEX",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:07:00.000Z",
    clickCount: 0,
    logoText: "CAKE",
  },
  {
    id: "opensea",
    slug: "opensea",
    name: "OpenSea",
    domain: "opensea.io",
    url: "https://opensea.io",
    description: "Marketplace for NFTs, collectibles, and digital assets.",
    category: "NFT",
    totalBidUsdt: 4260,
    rankingTimestamp: "2026-08-17T10:45:00.000Z",
    clickCount: 5284,
    logoText: "OS",
  },
  {
    id: "blur",
    slug: "blur",
    name: "Blur",
    domain: "blur.io",
    url: "https://blur.io",
    description: "NFT marketplace and trading platform for professional collectors.",
    category: "NFT",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:08:00.000Z",
    clickCount: 0,
    logoText: "BLUR",
  },
  {
    id: "immutable",
    slug: "immutable",
    name: "Immutable",
    domain: "immutable.com",
    url: "https://www.immutable.com",
    description: "Web3 gaming platform and infrastructure for blockchain games.",
    category: "Gaming",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:09:00.000Z",
    clickCount: 0,
    logoText: "IMX",
  },
  {
    id: "lens",
    slug: "lens",
    name: "Lens",
    domain: "lens.xyz",
    url: "https://lens.xyz",
    description: "Social graph and app ecosystem for on-chain social experiences.",
    category: "SocialFi",
    totalBidUsdt: 3200,
    rankingTimestamp: "2026-08-16T13:25:00.000Z",
    clickCount: 4322,
    logoText: "LS",
  },
  {
    id: "coinbase",
    slug: "coinbase",
    name: "Coinbase",
    domain: "coinbase.com",
    url: "https://www.coinbase.com",
    description: "Crypto exchange, wallet, and on-chain application platform.",
    category: "Wallets",
    totalBidUsdt: 2760,
    rankingTimestamp: "2026-08-16T07:30:00.000Z",
    clickCount: 4106,
    logoText: "CB",
  },
  {
    id: "aave",
    slug: "aave",
    name: "Aave",
    domain: "aave.com",
    url: "https://aave.com",
    description: "Decentralized liquidity protocol for borrowing and supplying assets.",
    category: "DeFi",
    totalBidUsdt: 10,
    rankingTimestamp: "2026-09-03T00:01:00.000Z",
    clickCount: 0,
    logoText: "AA",
  },
  {
    id: "celestia",
    slug: "celestia",
    name: "Celestia",
    domain: "celestia.org",
    url: "https://celestia.org",
    description: "Modular data availability network for rollups and app chains.",
    category: "Infrastructure",
    totalBidUsdt: 1980,
    rankingTimestamp: "2026-08-15T12:18:00.000Z",
    clickCount: 3460,
    logoText: "TIA",
  },
  {
    id: "base",
    slug: "base",
    name: "Base",
    domain: "base.org",
    url: "https://base.org",
    description: "Ethereum layer two network built for consumer crypto applications.",
    category: "L2",
    totalBidUsdt: 1540,
    rankingTimestamp: "2026-08-14T20:52:00.000Z",
    clickCount: 3045,
    logoText: "B",
  },
  {
    id: "zora",
    slug: "zora",
    name: "Zora",
    domain: "zora.co",
    url: "https://zora.co",
    description: "On-chain creative network for minting and collecting media.",
    category: "NFT",
    totalBidUsdt: 1180,
    rankingTimestamp: "2026-08-14T09:16:00.000Z",
    clickCount: 2718,
    logoText: "ZR",
  },
];

export function rankedProjects(projects = developmentProjects) {
  return [...projects].sort((a, b) => {
    if (a.totalBidUsdt !== b.totalBidUsdt) {
      return b.totalBidUsdt - a.totalBidUsdt;
    }

    return (
      new Date(a.rankingTimestamp).getTime() -
      new Date(b.rankingTimestamp).getTime()
    );
  });
}

export function getProjectRank(slug: string) {
  return rankedProjects().findIndex((project) => project.slug === slug) + 1;
}

export function formatUsdt(value: number | bigint) {
  return `${new Intl.NumberFormat("en-US").format(value)} USDT`;
}

export function getClaimTopBid(projects = developmentProjects) {
  const [top] = rankedProjects(projects);
  return top ? top.totalBidUsdt + 5 : 5;
}

export function getNextRankTarget(rank: number, projects = developmentProjects) {
  const ranked = rankedProjects(projects);
  if (rank <= 1) {
    return ranked[0] ? ranked[0].totalBidUsdt + 5 : 5;
  }

  const target = ranked[rank - 2];
  return target ? target.totalBidUsdt + 1 : 5;
}

export const developmentActivity = [
  {
    id: "a1",
    label: "uniswap.org took #1",
    detail: "14,023 USDT",
    kind: "crown",
  },
  {
    id: "a2",
    label: "bittensor.com listed",
    detail: "10 USDT",
    kind: "boost",
  },
  {
    id: "a3",
    label: "chain.link passed solana.com",
    detail: "12,100 USDT",
    kind: "duel",
  },
  {
    id: "a4",
    label: "ondo.finance jumped 3 positions",
    detail: "7,350 USDT",
    kind: "move",
  },
];
