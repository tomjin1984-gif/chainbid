import type { LeaderboardEntry, ProjectRecord } from "./types";

export function sortProjectsForLeaderboard<T extends Pick<ProjectRecord, "totalBidUsdt" | "rankingTimestamp">>(
  projects: T[],
): T[] {
  return [...projects].sort((a, b) => {
    if (a.totalBidUsdt !== b.totalBidUsdt) {
      return a.totalBidUsdt > b.totalBidUsdt ? -1 : 1;
    }

    return (
      new Date(a.rankingTimestamp).getTime() -
      new Date(b.rankingTimestamp).getTime()
    );
  });
}

export function claimTopBid(projects: Pick<ProjectRecord, "totalBidUsdt" | "rankingTimestamp">[]): bigint {
  const [top] = sortProjectsForLeaderboard(projects);
  return top ? top.totalBidUsdt + BigInt(5) : BigInt(5);
}

export function targetToPassRank(
  rank: number,
  projects: Pick<ProjectRecord, "totalBidUsdt" | "rankingTimestamp">[],
): bigint {
  const sorted = sortProjectsForLeaderboard(projects);
  if (rank <= 1) {
    return claimTopBid(sorted);
  }

  const target = sorted[rank - 2];
  return target ? target.totalBidUsdt + BigInt(1) : BigInt(5);
}

export function rankForTotalBid(
  totalBidUsdt: bigint,
  rankingTimestamp: string,
  projects: Pick<ProjectRecord, "totalBidUsdt" | "rankingTimestamp">[],
): number {
  const timestamp = new Date(rankingTimestamp).getTime();
  let rank = 1;

  for (const project of projects) {
    if (project.totalBidUsdt > totalBidUsdt) {
      rank += 1;
      continue;
    }

    if (
      project.totalBidUsdt === totalBidUsdt &&
      new Date(project.rankingTimestamp).getTime() < timestamp
    ) {
      rank += 1;
    }
  }

  return rank;
}

export function decorateLeaderboard(projects: ProjectRecord[]): LeaderboardEntry[] {
  const sorted = sortProjectsForLeaderboard(
    projects.filter((project) => project.status === "active"),
  );

  return sorted.map((project, index) => ({
    ...project,
    rank: index + 1,
    nextRankTargetUsdt: targetToPassRank(index + 1, sorted),
  }));
}
