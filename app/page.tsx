import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClaimAmountControl } from "@/components/claim-amount-control";
import { HomeLeaderboard } from "@/components/home-leaderboard";
import { OutbidQuickForm } from "@/components/outbid-quick-form";
import {
  categories,
} from "@/lib/seed";
import { getNetworkConfigs } from "@/lib/config/networks";
import { getPublicAppUrl } from "@/lib/config/env";
import { claimTopBid } from "@/lib/domain/ranking";
import { runAutomaticPaymentSweep } from "@/lib/payment/auto-sweep";
import { getRepository } from "@/lib/repository";
import { publicLeaderboardEntry } from "@/lib/repository/serializers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const socialPreviewImage = "/og-chainbid-share.png";

function formatRunTime(startedAt: Date, now = new Date()) {
  const elapsedMs = Math.max(0, now.getTime() - startedAt.getTime());
  const elapsedHours = Math.max(1, Math.floor(elapsedMs / (1000 * 60 * 60)));

  if (elapsedHours < 48) {
    return `${elapsedHours.toLocaleString()} hours ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 60) {
    return `${elapsedDays.toLocaleString()} days ago`;
  }

  const elapsedMonths = Math.floor(elapsedDays / 30);
  return `${elapsedMonths.toLocaleString()} months ago`;
}

function getLaunchDate(records: { createdAt: string; rankingTimestamp?: string }[]) {
  const timestamps = records
    .flatMap((record) => [record.createdAt, record.rankingTimestamp])
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  return new Date(Math.min(...timestamps, Date.now()));
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : getPublicAppUrl();
  const imageUrl = `${origin}${socialPreviewImage}`;

  return {
    title: "Chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: origin,
    },
    openGraph: {
      title: "Chain.bid - The Crypto Leaderboard",
      description:
        "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
      url: origin,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Chain.bid - The Crypto Leaderboard",
      description:
        "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
      images: [imageUrl],
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }> | { category?: string; page?: string };
}) {
  const params = await searchParams;
  const activeCategory = params.category ?? "All";
  const repository = getRepository();
  await runAutomaticPaymentSweep({
    repository,
    limit: 3,
    maxWaitMs: 3_000,
  });
  const [allProjects, activity] = await Promise.all([
    repository.getLeaderboard(),
    repository.getActivity(8),
  ]);
  const categoryClaimAmounts = categories.reduce<Record<string, string>>(
    (amounts, category) => {
      const categoryProjects =
        category === "All"
          ? allProjects
          : allProjects.filter((project) => project.category === category);

      amounts[category] = claimTopBid(categoryProjects).toString();
      return amounts;
    },
    {},
  );
  const formDefaultCategory =
    activeCategory !== "All" && categories.includes(activeCategory as (typeof categories)[number])
      ? activeCategory
      : "DeFi";
  const initialClaimCategory = categories.includes(activeCategory as (typeof categories)[number])
    ? activeCategory
    : formDefaultCategory;
  const initialClaimAmount =
    categoryClaimAmounts[initialClaimCategory] ?? claimTopBid(allProjects).toString();
  const totalSiteBidUsdt = allProjects.reduce(
    (total, project) => total + project.totalBidUsdt,
    BigInt(0),
  );
  const launchDate = getLaunchDate([
    ...allProjects,
    ...activity.map((event) => ({ createdAt: event.createdAt })),
  ]);
  const runTime = formatRunTime(launchDate);
  const initialPage = Number.parseInt(params.page ?? "1", 10);
  const defaultNetwork =
    getNetworkConfigs().find((network) => network.enabled)?.network ?? "bsc";

  return (
    <main className="site-shell home-layout">
      <section className="outbid-hero">
        <header className="outbid-title-block">
          <ClaimAmountControl
            key={`${formDefaultCategory}-${initialClaimAmount}`}
            initialAmount={initialClaimAmount}
            formId="outbid-submit-form"
            categoryAmounts={categoryClaimAmounts}
          />
          <p>
            <span>New spots start at 5 USDT.</span> Paying less than the #1
            price still puts you on the board wherever that bid can take you.
          </p>
        </header>

        <OutbidQuickForm
          formId="outbid-submit-form"
          defaultCategory={formDefaultCategory}
          network={defaultNetwork}
        />

        <p className="outbid-helper">
          Already on the list? Enter the same URL and use Boost on any ranked
          row to pay only the difference.
        </p>
      </section>

      <HomeLeaderboard
        projects={allProjects.map(publicLeaderboardEntry)}
        activity={activity}
        initialCategory={activeCategory}
        initialPage={Number.isFinite(initialPage) ? initialPage : 1}
      />

      <section className="site-stats-footer" aria-label="Site statistics">
        <p>
          This leaderboard has processed <span>verified USDT</span>
        </p>
        <div className="site-total-card">
          <span aria-hidden="true">$</span>
          <strong>{totalSiteBidUsdt.toLocaleString()}</strong>
          <small>USDT</small>
        </div>
        <p>since its launch {runTime}</p>
        <div className="footer-links">
          <span>Chain.bid</span>
          <span>·</span>
          <a href="/rules">Rules</a>
          <span>·</span>
          <a href="#leaderboard">Live stats</a>
          <span>·</span>
          <a
            href="https://x.com/Chainbid"
            className="footer-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Chainbid on X"
          >
            <span aria-hidden="true">X</span>
          </a>
        </div>
      </section>
    </main>
  );
}
