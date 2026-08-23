/* eslint-disable @next/next/no-img-element -- Project icons come from arbitrary submitted URLs. */
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fragment } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Crown,
  Flame,
  Rocket,
  Swords,
} from "lucide-react";
import { CategoryDropdown } from "@/components/category-dropdown";
import { ClaimAmountControl } from "@/components/claim-amount-control";
import {
  categories,
} from "@/lib/seed";
import { getPublicAppUrl } from "@/lib/config/env";
import { claimTopBid } from "@/lib/domain/ranking";
import { formatUsdt } from "@/lib/domain/money";
import { getRepository } from "@/lib/repository";
import type { ActivityEventRecord, LeaderboardEntry } from "@/lib/domain/types";

const activityIcons = {
  project_created: Rocket,
  payment_detected: Flame,
  payment_confirmed: Flame,
  payment_credited: Crown,
  rank_changed: Swords,
  manual_review: Flame,
};

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

function formatActivityAge(createdAt: string, now = new Date()) {
  const createdTime = new Date(createdAt).getTime();
  const elapsedMs = Math.max(0, now.getTime() - createdTime);
  const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / (1000 * 60)));

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} minutes ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 48) {
    return `${elapsedHours} hours ago`;
  }

  return `${Math.floor(elapsedHours / 24)} days ago`;
}

function RankSectionDivider({ label }: { label: string }) {
  return (
    <div className="rank-section-divider" aria-label={label}>
      <span>{label}</span>
    </div>
  );
}

function LatestActivityStrip({
  activity,
  projects,
}: {
  activity: ActivityEventRecord[];
  projects: LeaderboardEntry[];
}) {
  const items = activity.slice(0, 5).map((event) => {
    const project = event.projectId
      ? projects.find((item) => item.id === event.projectId)
      : null;
    const domain = project ? new URL(project.url).hostname : event.headline.split(" ")[0];
    const Icon = activityIcons[event.kind] ?? Flame;

    return {
      id: event.id,
      domain,
      rank: project ? `#${project.rank}` : "live",
      amount: project ? formatUsdt(project.totalBidUsdt) : event.headline.split(" - ").at(-1) ?? "",
      age: formatActivityAge(event.createdAt),
      icon: Icon,
      initials: project?.name.slice(0, 2).toUpperCase(),
      logoUrl: project?.logoUrl ?? null,
    };
  });

  if (!items.length) {
    return null;
  }

  return (
    <article className="latest-activity-strip" aria-label="Latest activity">
      <div className="latest-activity-heading">
        <span aria-hidden="true" />
        <strong>Latest activity</strong>
      </div>
      <div className="latest-activity-scroller">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div className="activity-pill" key={item.id}>
              <span className="activity-avatar" aria-hidden="true">
                {item.logoUrl ? (
                  <img src={item.logoUrl} alt="" loading="lazy" />
                ) : (
                  item.initials ?? <Icon size={14} />
                )}
              </span>
              <div>
                <strong>{item.domain}</strong>
                <small>
                  at {item.rank} · {item.amount}
                </small>
                <span>{item.age}</span>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ProjectRankCard({
  project,
  featured = false,
}: {
  project: LeaderboardEntry;
  featured?: boolean;
}) {
  const domain = new URL(project.url).hostname;
  const isTopRank = project.rank <= 3;
  const cardClassName = [
    "ranked-card",
    isTopRank ? "ranked-card-top" : "",
    featured ? "ranked-card-featured" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cardClassName}>
      <div className="rank-column">
        <span className={project.rank === 1 ? "rank-badge rank-badge-top" : "rank-badge"}>
          {project.rank === 1 ? <Crown size={16} /> : null}
          #{project.rank}
        </span>
      </div>
      <a
        className="rank-project"
        href={`/api/click/${project.id}`}
        aria-label={`Visit ${project.name}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {project.logoUrl ? (
          <img
            className="logo-image"
            src={project.logoUrl}
            alt=""
            width={42}
            height={42}
            loading="lazy"
          />
        ) : (
          <div className="logo-token">{project.name.slice(0, 2).toUpperCase()}</div>
        )}
        <div>
          <span className="project-name">{project.name}</span>
          <span className="domain">{domain}</span>
          <p>{project.description}</p>
        </div>
      </a>
      <div className="rank-meta">
        <span>{project.category}</span>
        <small>{project.clickCount.toLocaleString()} clicks</small>
      </div>
      <div className="rank-bid">
        <strong>{formatUsdt(project.totalBidUsdt)}</strong>
        <small>pass at {formatUsdt(project.nextRankTargetUsdt)}</small>
      </div>
      <Link
        href={`/submit?boost=${project.slug}&target=${project.nextRankTargetUsdt.toString()}`}
        className="button button-small rank-action"
      >
        Boost
        <ArrowUpRight size={16} />
      </Link>
    </article>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : getPublicAppUrl();
  const imageUrl = `${origin}/og.png`;

  return {
    title: "chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
    alternates: {
      canonical: origin,
    },
    openGraph: {
      title: "chain.bid - The Crypto Leaderboard",
      description:
        "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
      url: origin,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "chain.bid - The Crypto Leaderboard",
      description:
        "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
      images: [imageUrl],
    },
  };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }> | { category?: string };
}) {
  const params = await searchParams;
  const activeCategory = params.category ?? "All";
  const repository = getRepository();
  const [projects, allProjects, activity] = await Promise.all([
    repository.getLeaderboard(activeCategory),
    repository.getLeaderboard(),
    repository.getActivity(8),
  ]);
  const topBid = claimTopBid(projects);
  const totalSiteBidUsdt = allProjects.reduce(
    (total, project) => total + project.totalBidUsdt,
    BigInt(0),
  );
  const launchDate = getLaunchDate([
    ...allProjects,
    ...activity.map((event) => ({ createdAt: event.createdAt })),
  ]);
  const runTime = formatRunTime(launchDate);

  return (
    <main className="site-shell home-layout">
      <section className="outbid-hero">
        <header className="outbid-title-block">
          <ClaimAmountControl
            key={`${activeCategory}-${topBid.toString()}`}
            initialAmount={topBid.toString()}
            formId="outbid-submit-form"
          />
          <p>
            <span>New spots start at 5 USDT.</span> Paying less than the #1
            price still puts you on the board wherever that bid can take you.
          </p>
        </header>

        <form id="outbid-submit-form" className="outbid-submit-row" action="/submit" method="get">
          <label>
            <span className="input-icon" aria-hidden="true">⌁</span>
            <span className="sr-only">Project URL</span>
            <input name="url" placeholder="https://example.xyz" />
          </label>
          <CategoryDropdown defaultValue="DeFi" />
          <button className="button outbid-submit-button" type="submit">
            Outbid
            <ArrowRight size={18} />
          </button>
        </form>

        <p className="outbid-helper">
          Already on the list? Enter the same URL and use Boost on any ranked
          row to pay only the difference.
        </p>
      </section>

      <section id="leaderboard" className="leaderboard-section">
        <div className="leaderboard-toolbar">
          <p className="eyebrow">LIVE RANKING</p>
          <span>Credited payments only</span>
        </div>

        <div id="categories" className="category-row category-bar" aria-label="Leaderboard categories">
          {categories.map((category) => (
            <Link
              key={category}
              href={category === "All" ? "/" : `/?category=${encodeURIComponent(category)}`}
              className={category === activeCategory ? "chip chip-active" : "chip"}
            >
              {category}
            </Link>
          ))}
        </div>

        <div className="ranked-list">
          {projects.map((project) => (
            <Fragment key={project.id}>
              <ProjectRankCard
                project={project}
                featured={project.rank === 1}
              />

              {project.rank === 3 ? (
                <LatestActivityStrip activity={activity} projects={allProjects} />
              ) : null}

              {project.rank === 10 ? <RankSectionDivider label="Top 10" /> : null}
              {project.rank === 20 ? <RankSectionDivider label="Top 20" /> : null}
            </Fragment>
          ))}
        </div>

        <div className="pagination-bar">
          <button type="button" disabled>
            <ArrowLeft size={16} />
            Previous
          </button>
          <span>
            Showing 1-{projects.length} of {projects.length}
          </span>
          <button type="button" disabled>
            Next
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

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
          <span>chain.bid</span>
          <span>·</span>
          <Link href="/rules">Rules</Link>
          <span>·</span>
          <a href="#leaderboard">Live stats</a>
        </div>
      </section>
    </main>
  );
}
