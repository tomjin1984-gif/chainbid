/* eslint-disable @next/next/no-img-element -- Brand logo uses the exported static SVG asset. */
import Link from "next/link";
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
          <Link href="/" className="brand-mark" aria-label="Chain.bid home">
            <img
              className="brand-logo"
              src="/brand/chain-bid-logo.svg"
              alt=""
              width={34}
              height={34}
            />
            <span>Chain.bid</span>
          </Link>
          <div className="topbar-actions">
            <div className="topbar-links">
              <Link href="/#leaderboard">Leaderboard</Link>
              <Link href="/categories">Categories</Link>
              <Link href="/rules">Rules</Link>
              <Link href="/admin">Admin</Link>
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
          <Link href="/#leaderboard">see stats→</Link>
        </div>
      </div>
    </header>
  );
}
