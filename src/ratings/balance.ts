/** Splits players into two teams of near-equal strength. Pure, deterministic. */

export interface Balanceable {
  userId: string;
  rating: number;
}

export interface BalancedTeams {
  home: string[];
  away: string[];
}

function average(sum: number, count: number): number {
  return count === 0 ? 0 : sum / count;
}

/**
 * Team sizes differ by at most one. Players are dealt strongest first to the weaker side,
 * then single swaps are tried while they bring the two average ratings closer.
 */
export function balanceTeams(players: readonly Balanceable[]): BalancedTeams {
  const sorted = [...players].sort((a, b) => b.rating - a.rating || a.userId.localeCompare(b.userId));
  const homeSize = Math.ceil(sorted.length / 2);
  const awaySize = sorted.length - homeSize;

  const home: Balanceable[] = [];
  const away: Balanceable[] = [];
  let homeSum = 0;
  let awaySum = 0;
  for (const player of sorted) {
    const homeFull = home.length >= homeSize;
    const awayFull = away.length >= awaySize;
    const toHome = awayFull || (!homeFull && homeSum <= awaySum);
    if (toHome) {
      home.push(player);
      homeSum += player.rating;
    } else {
      away.push(player);
      awaySum += player.rating;
    }
  }

  const gap = () => Math.abs(average(homeSum, home.length) - average(awaySum, away.length));
  for (let round = 0; round < 50; round++) {
    let best = { gap: gap(), i: -1, j: -1 };
    for (let i = 0; i < home.length; i++) {
      for (let j = 0; j < away.length; j++) {
        const change = away[j].rating - home[i].rating;
        const swappedGap = Math.abs(average(homeSum + change, home.length) - average(awaySum - change, away.length));
        if (swappedGap < best.gap - 1e-9) best = { gap: swappedGap, i, j };
      }
    }
    if (best.i < 0) break;
    const change = away[best.j].rating - home[best.i].rating;
    [home[best.i], away[best.j]] = [away[best.j], home[best.i]];
    homeSum += change;
    awaySum -= change;
  }

  return { home: home.map((p) => p.userId), away: away.map((p) => p.userId) };
}
