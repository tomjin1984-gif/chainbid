/* eslint-disable @next/next/no-html-link-for-pages -- Public Sites navigation must work without client router hydration. */
/* eslint-disable @next/next/no-img-element -- Brand logo uses the exported static SVG asset. */
import { ThemeToggle } from "@/components/theme-toggle";
import { getRepository } from "@/lib/repository";

export async function GlobalHeader() {
  const repository = getRepository();
  const [projects, activity] = await Promise.all([
    repository.getLeaderboard(),
    repository.getActivity(8),
  ]);
  const totalClicks = projects.reduce(
    (total, project) => total + project.clickCount,
    BigInt(0),
  );
  const onlineCount = Math.max(24, projects.length * 37 + activity.length);

  return (
    <header className="global-header">
      <div className="global-header-inner">
        <nav className="corner-nav" aria-label="Primary">
          <a href="/" className="brand-mark" aria-label="Chain.bid home">
            <img
              className="brand-logo"
              src="/brand/chain-bid-logo.svg"
              alt=""
              width={34}
              height={34}
            />
            <span>Chain.bid</span>
          </a>
          <div className="topbar-actions">
            <div className="topbar-links">
              <a href="/#leaderboard">Leaderboard</a>
              <a href="/categories">Categories</a>
              <a href="/rules">Rules</a>
              <a href="/about">About</a>
            </div>
            <ThemeToggle />
          </div>
        </nav>

        <div className="outbid-status-pill" aria-label="Leaderboard status">
          <span className="online-dot" aria-hidden="true" />
          <strong>{onlineCount.toLocaleString()} online</strong>
          <span>·</span>
          <span>{totalClicks.toLocaleString()} visitors since launch</span>
          <span>·</span>
          <a href="/#leaderboard">see stats→</a>
        </div>
      </div>
    </header>
  );
}
