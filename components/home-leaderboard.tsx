"use client";

/* eslint-disable @next/next/no-img-element -- Project icons come from arbitrary submitted URLs. */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Crown,
  Flame,
  Rocket,
  Swords,
} from "lucide-react";
import { RankedCardShell } from "@/components/ranked-card-shell";
import { formatUsdt } from "@/lib/domain/money";
import { projectDisplayName } from "@/lib/project-metadata";
import { staticProjectIconUrl } from "@/lib/static-project-icons";
import { categories } from "@/lib/seed";
import type { ActivityEventRecord, LeaderboardEntry } from "@/lib/domain/types";

const categoryChangeEvent = "chainbid:category-change";
const leaderboardPageSize = 50;
const storedDataIconPattern =
  /^data:image\/(?:png|jpe?g|gif|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z0-9+/=]+$/i;

type PublicLeaderboardEntry = Omit<
  LeaderboardEntry,
  "totalBidUsdt" | "clickCount" | "nextRankTargetUsdt"
> & {
  totalBidUsdt: string;
  clickCount: string;
  nextRankTargetUsdt: string;
};

const activityIcons = {
  project_created: Rocket,
  payment_detected: Flame,
  payment_confirmed: Flame,
  payment_credited: Crown,
  rank_changed: Swords,
  manual_review: Flame,
};

function validCategory(category: string | undefined | null) {
  return category && categories.includes(category as (typeof categories)[number])
    ? category
    : "All";
}

function storedDataIconUrl(icon: string) {
  return storedDataIconPattern.test(icon) ? icon : null;
}

function projectLogoUrl(project: Pick<PublicLeaderboardEntry, "logoUrl" | "slug" | "url">) {
  const url = project.url.trim();
  if (!url) {
    return null;
  }

  const icon = project.logoUrl?.trim();
  if (icon) {
    const dataIcon = storedDataIconUrl(icon);
    if (dataIcon) {
      return dataIcon;
    }

    if (icon.startsWith("/project-icons/")) {
      return icon;
    }
  }

  const staticIcon = staticProjectIconUrl(project.slug);
  if (staticIcon) {
    return staticIcon;
  }

  if (icon) {
    try {
      const iconUrl = new URL(icon);
      if (iconUrl.hostname !== "www.google.com" || iconUrl.pathname !== "/s2/favicons") {
        const params = new URLSearchParams({ url });
        params.set("src", iconUrl.toString());
        return `/api/project-icon?${params.toString()}`;
      }
    } catch {
      // Fall through to the local static icon.
    }
  }

  return staticProjectIconUrl(project.slug);
}

function projectTitle(project: Pick<PublicLeaderboardEntry, "name" | "url">) {
  return projectDisplayName(project.name, project.url);
}

function DeferredProjectLogo({
  project,
  title,
  priority = false,
  compact = false,
}: {
  project: Pick<PublicLeaderboardEntry, "logoUrl" | "slug" | "url">;
  title: string;
  priority?: boolean;
  compact?: boolean;
}) {
  const [shouldLoad, setShouldLoad] = useState(false);
  const [failed, setFailed] = useState(false);
  const logoRef = useRef<HTMLSpanElement>(null);
  const logoUrl = useMemo(() => projectLogoUrl(project), [project]);
  const initials = title.slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!logoUrl || failed) {
      return;
    }

    const node = logoRef.current;
    let cancelIdleLoad: (() => void) | null = null;
    let observer: IntersectionObserver | null = null;
    let cancelled = false;

    function scheduleLoad(timeoutMs: number) {
      if ("requestIdleCallback" in window) {
        const handle = window.requestIdleCallback(
          () => {
            if (!cancelled) {
              setShouldLoad(true);
            }
          },
          { timeout: timeoutMs },
        );
        cancelIdleLoad = () => window.cancelIdleCallback(handle);
      } else {
        const handle = globalThis.setTimeout(() => {
          if (!cancelled) {
            setShouldLoad(true);
          }
        }, Math.min(timeoutMs, 900));
        cancelIdleLoad = () => globalThis.clearTimeout(handle);
      }
    }

    if (priority) {
      scheduleLoad(700);
    } else if (node && "IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            scheduleLoad(1_500);
          }
        },
        { rootMargin: "180px" },
      );
      observer.observe(node);
    } else {
      scheduleLoad(1_500);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      cancelIdleLoad?.();
    };
  }, [failed, logoUrl, priority]);

  return (
    <span
      ref={logoRef}
      className={compact ? "project-logo-stack project-logo-stack-compact" : "project-logo-stack"}
      aria-hidden="true"
    >
      <span className="logo-token">{initials}</span>
      {shouldLoad && logoUrl && !failed ? (
        <img
          className="logo-image"
          src={logoUrl}
          alt=""
          width={compact ? 30 : 42}
          height={compact ? 30 : 42}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
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

function sortedProjects(projects: PublicLeaderboardEntry[]) {
  return [...projects].sort((first, second) => {
    const firstBid = BigInt(first.totalBidUsdt);
    const secondBid = BigInt(second.totalBidUsdt);
    if (firstBid !== secondBid) {
      return firstBid > secondBid ? -1 : 1;
    }

    return (
      new Date(first.rankingTimestamp).getTime() -
      new Date(second.rankingTimestamp).getTime()
    );
  });
}

function claimTopBid(projects: Pick<PublicLeaderboardEntry, "totalBidUsdt" | "rankingTimestamp">[]) {
  const [top] = sortedProjects(projects as PublicLeaderboardEntry[]);
  return top ? BigInt(top.totalBidUsdt) + BigInt(5) : BigInt(5);
}

function targetToPassRank(rank: number, projects: PublicLeaderboardEntry[]) {
  if (rank <= 1) {
    return claimTopBid(projects);
  }

  const target = projects[rank - 2];
  return target ? BigInt(target.totalBidUsdt) + BigInt(1) : BigInt(5);
}

function decorateProjects(projects: PublicLeaderboardEntry[]) {
  const sorted = sortedProjects(projects);

  return sorted.map((project, index) => ({
    ...project,
    rank: index + 1,
    nextRankTargetUsdt: targetToPassRank(index + 1, sorted).toString(),
  }));
}

function categoryHref(category: string, page = 1) {
  const params = new URLSearchParams();
  if (category !== "All") {
    params.set("category", category);
  }
  if (page > 1) {
    params.set("page", page.toString());
  }

  const query = params.toString();
  return `${query ? `/?${query}` : "/"}#leaderboard`;
}

function clampPage(page: number, pageCount: number) {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(page), 1), pageCount);
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

function updateUrl(category: string, page: number) {
  window.history.pushState(null, "", categoryHref(category, page));
}

function announceCategory(category: string) {
  window.dispatchEvent(
    new CustomEvent(categoryChangeEvent, {
      detail: { category },
    }),
  );
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
  projects: PublicLeaderboardEntry[];
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
      amount: project ? formatUsdt(BigInt(project.totalBidUsdt)) : event.headline.split(" - ").at(-1) ?? "",
      age: formatActivityAge(event.createdAt),
      icon: Icon,
      initials: project ? projectTitle(project).slice(0, 2).toUpperCase() : null,
      project,
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
                {item.project ? (
                  <DeferredProjectLogo project={item.project} title={item.title} compact />
                ) : item.initials ? (
                  item.initials
                ) : (
                  <Icon size={14} />
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
  project: PublicLeaderboardEntry;
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
          <DeferredProjectLogo project={project} title={title} priority={project.rank <= 3} />
          <div>
            <span className="project-name">{title}</span>
            <p>{project.description}</p>
          </div>
        </div>
        <div className="rank-meta">
          <span>{project.category}</span>
          <small>{BigInt(project.clickCount).toLocaleString()} clicks</small>
        </div>
        <div className="rank-bid">
          <strong>{formatUsdt(BigInt(project.totalBidUsdt))}</strong>
          <small>pass at {formatUsdt(BigInt(project.nextRankTargetUsdt))}</small>
        </div>
      </a>
      <a
        href={`/submit?boost=${project.slug}&target=${project.nextRankTargetUsdt}`}
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
  onPageChange,
}: {
  activeCategory: string;
  currentPage: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(pageCount, currentPage + 1);
  const pages = getPaginationItems(currentPage, pageCount);

  function handlePageClick(page: number) {
    return (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      onPageChange(page);
    };
  }

  return (
    <nav className="pagination-bar pagination-bar-centered" aria-label="Leaderboard pagination">
      <div className="pagination-main">
        <div className="pagination-pages">
          {currentPage > 1 ? (
            <a
              className="page-control"
              href={categoryHref(activeCategory, previousPage)}
              aria-label="Previous page"
              onClick={handlePageClick(previousPage)}
            >
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
              <a
                className="page-number"
                href={categoryHref(activeCategory, page)}
                key={page}
                onClick={handlePageClick(page)}
              >
                {page}
              </a>
            )
          ))}

          {currentPage < pageCount ? (
            <a
              className="page-control"
              href={categoryHref(activeCategory, nextPage)}
              aria-label="Next page"
              onClick={handlePageClick(nextPage)}
            >
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

export function HomeLeaderboard({
  projects,
  activity,
  initialCategory,
  initialPage,
}: {
  projects: PublicLeaderboardEntry[];
  activity: ActivityEventRecord[];
  initialCategory: string;
  initialPage: number;
}) {
  const [activeCategory, setActiveCategory] = useState(() => validCategory(initialCategory));
  const [currentPage, setCurrentPage] = useState(() => Math.max(1, Math.trunc(initialPage)));
  const allProjects = useMemo(() => decorateProjects(projects), [projects]);
  const categoryProjects = useMemo(() => {
    const filtered =
      activeCategory === "All"
        ? allProjects
        : allProjects.filter((project) => project.category === activeCategory);

    return decorateProjects(filtered);
  }, [activeCategory, allProjects]);
  const pageCount = Math.max(1, Math.ceil(categoryProjects.length / leaderboardPageSize));
  const safePage = clampPage(currentPage, pageCount);
  const pageStartIndex = (safePage - 1) * leaderboardPageSize;
  const visibleProjects = categoryProjects.slice(
    pageStartIndex,
    pageStartIndex + leaderboardPageSize,
  );
  const rangeStart = categoryProjects.length ? pageStartIndex + 1 : 0;
  const rangeEnd = Math.min(pageStartIndex + visibleProjects.length, categoryProjects.length);

  useEffect(() => {
    function handlePopState() {
      const params = new URLSearchParams(window.location.search);
      const nextCategory = validCategory(params.get("category"));
      const nextPage = Number.parseInt(params.get("page") ?? "1", 10);
      setActiveCategory(nextCategory);
      setCurrentPage(clampPage(nextPage, pageCount));
      announceCategory(nextCategory);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [pageCount]);

  function selectCategory(category: string) {
    const nextCategory = validCategory(category);
    setActiveCategory(nextCategory);
    setCurrentPage(1);
    updateUrl(nextCategory, 1);
    announceCategory(nextCategory);
  }

  function selectPage(page: number) {
    const nextPage = clampPage(page, pageCount);
    setCurrentPage(nextPage);
    updateUrl(activeCategory, nextPage);
  }

  return (
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
            href={categoryHref(category)}
            className={category === activeCategory ? "chip chip-active" : "chip"}
            onClick={(event) => {
              event.preventDefault();
              selectCategory(category);
            }}
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
        currentPage={safePage}
        pageCount={pageCount}
        start={rangeStart}
        end={rangeEnd}
        total={categoryProjects.length}
        onPageChange={selectPage}
      />
    </section>
  );
}
