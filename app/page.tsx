/* eslint-disable @next/next/no-img-element -- Project icons come from arbitrary submitted URLs. */
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
import { ClaimAmountControl } from "@/components/claim-amount-control";
import { OutbidQuickForm } from "@/components/outbid-quick-form";
import {
  categories,
} from "@/lib/seed";
import { RankedCardShell } from "@/components/ranked-card-shell";
import { getNetworkConfigs } from "@/lib/config/networks";
import { getPublicAppUrl } from "@/lib/config/env";
import { claimTopBid } from "@/lib/domain/ranking";
import { formatUsdt } from "@/lib/domain/money";
import { projectIconProxyUrl } from "@/lib/project-icons";
import { projectDisplayName } from "@/lib/project-metadata";
import { runAutomaticPaymentSweep } from "@/lib/payment/auto-sweep";
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
const leaderboardPageSize = 20;

function projectLogoUrl(project: Pick<LeaderboardEntry, "logoUrl" | "url">) {
  return projectIconProxyUrl(project.url, project.logoUrl);
}

function projectTitle(project: Pick<LeaderboardEntry, "name" | "url">) {
  return projectDisplayName(project.name, project.url);
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clampPage(page: string | undefined, pageCount: number) {
  const parsedPage = Number.parseInt(page ?? "1", 10);
  if (!Number.isFinite(parsedPage)) {
    return 1;
  }

  return Math.min(Math.max(parsedPage, 1), pageCount);
}

function getPaginationItems(currentPage: number, pageCount: number) {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", pageCount] as const;
  }

  if (currentPage >= pageCount - 2) {
    return [1, "ellipsis", pageCount - 3, pageCount - 2, pageCount - 1, pageCount] as const;
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", pageCount] as const;
}

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
    const title = project ? projectTitle(project) : event.headline.split(" ")[0];
    const Icon = activityIcons[event.kind] ?? Flame;

    return {
      id: event.id,
      title,
      rank: project ? `#${project.rank}` : "live",
      amount: project ? formatUsdt(project.totalBidUsdt) : event.headline.split(" - ").at(-1) ?? "",
      age: formatActivityAge(event.createdAt),
      icon: Icon,
      initials: project ? projectTitle(project).slice(0, 2).toUpperCase() : null,
      logoUrl: project ? projectLogoUrl(project) : null,
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
                <strong>{item.title}</strong>
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
  const isTopRank = project.rank <= 3;
  const title = projectTitle(project);
  const projectClickHref = `/api/click/${encodeURIComponent(project.id)}`;
  const cardClassName = [
    "ranked-card",
    isTopRank ? "ranked-card-top" : "",
    featured ? "ranked-card-featured" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <RankedCardShell className={cardClassName} href={projectClickHref} label={`Visit ${title}`}>
      <a
        className="rank-card-main"
        data-card-main-link=""
        href={projectClickHref}
        aria-label={`Visit ${title}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className="rank-column">
          <span className={project.rank === 1 ? "rank-badge rank-badge-top" : "rank-badge"}>
            {project.rank === 1 ? <Crown size={16} /> : null}
            #{project.rank}
          </span>
        </div>
        <div className="rank-project">
          {projectLogoUrl(project) ? (
            <img
              className="logo-image"
              src={projectLogoUrl(project) ?? ""}
              alt=""
              width={42}
              height={42}
              loading="lazy"
            />
          ) : (
            <div className="logo-token">{title.slice(0, 2).toUpperCase()}</div>
          )}
          <div>
            <span className="project-name">{title}</span>
            <p>{project.description}</p>
          </div>
        </div>
        <div className="rank-meta">
          <span>{project.category}</span>
          <small>{project.clickCount.toLocaleString()} clicks</small>
        </div>
        <div className="rank-bid">
          <strong>{formatUsdt(project.totalBidUsdt)}</strong>
          <small>pass at {formatUsdt(project.nextRankTargetUsdt)}</small>
        </div>
      </a>
      <a
        href={`/submit?boost=${project.slug}&target=${project.nextRankTargetUsdt.toString()}`}
        className="button button-small rank-action"
        data-card-action=""
        aria-label={`Boost ${title}`}
      >
        Boost
        <ArrowUpRight size={16} />
      </a>
    </RankedCardShell>
  );
}

function LeaderboardPagination({
  activeCategory,
  currentPage,
  pageCount,
  start,
  end,
  total,
}: {
  activeCategory: string;
  currentPage: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
}) {
  function pageHref(page: number) {
    const params = new URLSearchParams();
    if (activeCategory !== "All") {
      params.set("category", activeCategory);
    }
    if (page > 1) {
      params.set("page", page.toString());
    }

    const query = params.toString();
    return `${query ? `/?${query}` : "/"}#leaderboard`;
  }

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(pageCount, currentPage + 1);
  const pages = getPaginationItems(currentPage, pageCount);

  return (
    <nav className="pagination-bar pagination-bar-centered" aria-label="Leaderboard pagination">
      <div className="pagination-main">
        <div className="pagination-pages">
          {currentPage > 1 ? (
            <a className="page-control" href={pageHref(previousPage)} aria-label="Previous page">
              <ArrowLeft size={16} />
            </a>
          ) : (
            <span className="page-control page-control-disabled" aria-hidden="true">
              <ArrowLeft size={16} />
            </span>
          )}

          {pages.map((page, index) => (
            page === "ellipsis" ? (
              <span className="page-ellipsis" key={`ellipsis-${index}`}>
                ...
              </span>
            ) : page === currentPage ? (
              <span className="page-number page-number-active" key={page} aria-current="page">
                {page}
              </span>
            ) : (
              <a className="page-number" href={pageHref(page)} key={page}>
                {page}
              </a>
            )
          ))}

          {currentPage < pageCount ? (
            <a className="page-control" href={pageHref(nextPage)} aria-label="Next page">
              <ArrowRight size={16} />
            </a>
          ) : (
            <span className="page-control page-control-disabled" aria-hidden="true">
              <ArrowRight size={16} />
            </span>
          )}
        </div>
        <span className="pagination-range">
          {start.toLocaleString()} - {end.toLocaleString()} of {total.toLocaleString()}
        </span>
      </div>
    </nav>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${protocol}://${host}` : getPublicAppUrl();
  const imageUrl = `${origin}/og.png`;

  return {
    title: "Chain.bid - The Crypto Leaderboard",
    description:
      "Crypto projects compete for visibility. Higher verified USDT bids rank higher.",
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
        { url: "/favicon.ico", sizes: "50x50", type: "image/x-icon" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/brand/chain-bid-logo-50.png", sizes: "50x50", type: "image/png" },
        { url: "/brand/chain-bid-logo-100.png", sizes: "100x100", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
      apple: "/brand/chain-bid-logo-200.png",
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
  const [projects, allProjects, activity] = await Promise.all([
    repository.getLeaderboard(activeCategory),
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
  const pageCount = Math.max(1, Math.ceil(projects.length / leaderboardPageSize));
  const currentPage = clampPage(params.page, pageCount);
  const pageStartIndex = (currentPage - 1) * leaderboardPageSize;
  const visibleProjects = projects.slice(pageStartIndex, pageStartIndex + leaderboardPageSize);
  const rangeStart = projects.length ? pageStartIndex + 1 : 0;
  const rangeEnd = Math.min(pageStartIndex + visibleProjects.length, projects.length);
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

      <section id="leaderboard" className="leaderboard-section">
        <div className="leaderboard-toolbar">
          <p className="eyebrow">LIVE RANKING</p>
          <a href="/manual-transaction-check" className="manual-check-cta">
            Manual Check
            <ArrowUpRight size={14} />
          </a>
        </div>

        <div id="categories" className="category-row category-bar" aria-label="Leaderboard categories">
          {categories.map((category) => (
            <a
              key={category}
              href={category === "All" ? "/" : `/?category=${encodeURIComponent(category)}`}
              className={category === activeCategory ? "chip chip-active" : "chip"}
            >
              {category}
            </a>
          ))}
        </div>

        <div className="ranked-list">
          {visibleProjects.map((project) => (
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

        <LeaderboardPagination
          activeCategory={activeCategory}
          currentPage={currentPage}
          pageCount={pageCount}
          start={rangeStart}
          end={rangeEnd}
          total={projects.length}
        />
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
          <span>Chain.bid</span>
          <span>·</span>
          <a href="/rules">Rules</a>
          <span>·</span>
          <a href="#leaderboard">Live stats</a>
          <span>·</span>
          <a
            href="https://x.com/HyperJanus"
            className="footer-social-link"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow HyperJanus on X"
          >
            <span aria-hidden="true">X</span>
          </a>
        </div>
      </section>
    </main>
  );
}
