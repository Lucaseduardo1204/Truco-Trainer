// Phase 4: how the player evolves over saved matches. Pure TypeScript, no Angular.

import { HistoryEntry, MatchConfig } from '../engine/match';
import { FindingKind } from '../feedback/detectors';
import { analyzeMatch, MatchReport } from '../feedback/report';

/** The detectors that count as mistakes (a bluff is tracked, not a mistake). */
export type MistakeKind = Exclude<FindingKind, 'bluff'>;

export const MISTAKE_KINDS: readonly MistakeKind[] = ['ranFromStrong', 'acceptedWeak', 'wastedManilha', 'burnedBestCard'];

export type MistakeCounts = Readonly<Record<MistakeKind, number>>;

/** Average quality over this many matches (the current one and the ones right before). */
export const QUALITY_TREND_WINDOW = 5;

/** Win rate over this many matches (the current one and the ones right before). */
export const WIN_RATE_WINDOW = 10;

/** What the evolution needs from a saved match. A SavedMatch has this shape. */
export interface EvolutionInput {
  readonly playedAt: string;
  readonly config: MatchConfig;
  readonly seat: number;
  readonly history: readonly HistoryEntry[];
  readonly assisted?: boolean;
  readonly summary: {
    readonly won: boolean;
    readonly quality: number;
    readonly bluffAttempts: number;
    readonly bluffSuccesses: number;
    readonly mistakesByKind?: MistakeCounts;
  };
}

/** One match on the evolution charts. */
export interface EvolutionPoint {
  /** 1 = the oldest match shown. */
  readonly index: number;
  readonly playedAt: string;
  readonly won: boolean;
  /** 0..100 */
  readonly quality: number;
  /** Average quality of this match and the previous ones, up to QUALITY_TREND_WINDOW. */
  readonly qualityTrend: number;
  /** 0..100: wins among this match and the previous ones, up to WIN_RATE_WINDOW. */
  readonly recentWinRate: number;
  readonly mistakes: MistakeCounts;
  readonly bluffAttempts: number;
  readonly bluffSuccesses: number;
  readonly assisted: boolean;
}

/** How many mistakes of each kind a report found. */
export function countMistakes(report: MatchReport): MistakeCounts {
  const counts: Record<MistakeKind, number> = { ranFromStrong: 0, acceptedWeak: 0, wastedManilha: 0, burnedBestCard: 0 };
  for (const moment of report.moments) {
    if (moment.finding.severity === 'mistake') {
      counts[moment.finding.kind as MistakeKind]++;
    }
  }
  return counts;
}

/**
 * The evolution series, oldest match first. With `onlyUnassisted`, matches played with the
 * statistics panel are left out ("só no seco") and the averages use only the rest.
 */
export function buildEvolution(
  matches: readonly EvolutionInput[],
  options: { readonly onlyUnassisted: boolean },
): EvolutionPoint[] {
  const chosen = [...matches]
    .filter((match) => !options.onlyUnassisted || !match.assisted)
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt));

  return chosen.map((match, i) => {
    const qualityWindow = chosen.slice(Math.max(0, i + 1 - QUALITY_TREND_WINDOW), i + 1);
    const winWindow = chosen.slice(Math.max(0, i + 1 - WIN_RATE_WINDOW), i + 1);
    const wins = winWindow.filter((m) => m.summary.won).length;
    return {
      index: i + 1,
      playedAt: match.playedAt,
      won: match.summary.won,
      quality: match.summary.quality,
      qualityTrend: Math.round(average(qualityWindow.map((m) => m.summary.quality))),
      recentWinRate: Math.round((100 * wins) / winWindow.length),
      mistakes: mistakesOf(match),
      bluffAttempts: match.summary.bluffAttempts,
      bluffSuccesses: match.summary.bluffSuccesses,
      assisted: match.assisted ?? false,
    };
  });
}

/** Saved since Phase 4: read them. Older matches: rebuild the report by replay. */
function mistakesOf(match: EvolutionInput): MistakeCounts {
  return match.summary.mistakesByKind ?? countMistakes(analyzeMatch(match.config, match.history, match.seat));
}

function average(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
