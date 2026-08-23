import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
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
            <span className="brand-sigil">cb</span>
            <span>Chain.bid</span>
          </Link>
          <div className="topbar-actions">
            <Link href="/#leaderboard">Leaderboard</Link>
            <Link href="/categories">Categories</Link>
            <Link href="/rules">Rules</Link>
            <Link href="/admin">Admin</Link>
            <Link href="/submit" className="button button-small">
              <ArrowUpRight size={16} />
              Submit Project
            </Link>
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
