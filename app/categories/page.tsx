/* eslint-disable @next/next/no-html-link-for-pages -- Public Sites navigation must work without client router hydration. */
import {
  BadgeDollarSign,
  Bitcoin,
  Bot,
  Boxes,
  BrainCircuit,
  Building2,
  ChartCandlestick,
  CircleHelp,
  Coins,
  Gamepad2,
  Gem,
  Landmark,
  Layers,
  Network,
  RadioTower,
  Sparkles,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { categories, type Category } from "@/lib/seed";

export const metadata = {
  title: "Categories",
  description: "Browse every Chain.bid category and open its live ranking.",
};

const categoryIcons: Record<Exclude<Category, "All">, LucideIcon> = {
  "AI x Crypto": BrainCircuit,
  DeFi: Landmark,
  Memecoins: Gem,
  Infrastructure: Network,
  L1: Layers,
  L2: Boxes,
  DePIN: RadioTower,
  RWA: Building2,
  "Prediction Markets": TrendingUp,
  Wallets: Wallet,
  Trading: ChartCandlestick,
  DEX: BadgeDollarSign,
  NFT: Sparkles,
  Gaming: Gamepad2,
  SocialFi: Users,
  Other: CircleHelp,
};

const fallbackIcons = [Bitcoin, Bot, Coins, Trophy];

function iconForCategory(category: Exclude<Category, "All">) {
  return categoryIcons[category] ?? fallbackIcons[category.length % fallbackIcons.length];
}

export default function CategoriesPage() {
  const categoryCards = categories.filter(
    (category): category is Exclude<Category, "All"> => category !== "All",
  );

  return (
    <main className="site-shell subpage-shell categories-page">
      <section className="categories-hero">
        <p className="eyebrow">CATEGORIES</p>
        <h1>Categories</h1>
        <p>
          Every category has its own ranking. Pick one to see who leads it.
        </p>
      </section>

      <section className="categories-grid" aria-label="Leaderboard categories">
        {categoryCards.map((category) => {
          const Icon = iconForCategory(category);

          return (
            <a
              className="category-card"
              href={`/?category=${encodeURIComponent(category)}#leaderboard`}
              key={category}
            >
              <span className="category-card-icon" aria-hidden="true">
                <Icon size={20} strokeWidth={2.2} />
              </span>
              <strong>{category}</strong>
            </a>
          );
        })}
      </section>

      <div className="footer-links categories-footer">
        <span>Chain.bid</span>
        <span>·</span>
        <a href="/rules">Rules</a>
        <span>·</span>
        <a href="/#leaderboard">Live stats</a>
      </div>
    </main>
  );
}
