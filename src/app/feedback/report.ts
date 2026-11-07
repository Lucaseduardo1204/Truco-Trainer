// Feedback analyzer: the post-match report.
// Pure TypeScript, no Angular.

import { Card } from '../engine/card';
import { teamOf } from '../engine/hand';
import { HistoryEntry, MatchConfig, replayMatch } from '../engine/match';
import { extractDecisions } from './decisions';
import { detectFindings, Finding } from './detectors';

export interface KeyMoment {
  readonly finding: Finding;
  /** Curiosity: what the rivals really held at that moment. Never affects the score. */
  readonly rivalCards: readonly Card[];
  /** Bluffs only: true if the rival ran. */
  readonly bluffWorked: boolean | null;
}

export interface MatchReport {
  readonly won: boolean;
  readonly myScore: number;
  readonly theirScore: number;
  readonly handsPlayed: number;
  /** Decisions that count for the score: play a card, raise, accept, run. */
  readonly judgedDecisions: number;
  /** Decisions with at least one mistake. */
  readonly mistakes: number;
  /** 0..100: % of judged decisions without a mistake. */
  readonly quality: number;
  readonly bluffs: { readonly attempts: number; readonly successes: number };
  /** Mistakes and bluffs, in the order they happened. */
  readonly moments: readonly KeyMoment[];
}

const JUDGED_TYPES = new Set(['playCard', 'raise', 'accept', 'run']);

export function analyzeMatch(config: MatchConfig, history: readonly HistoryEntry[], seat: number): MatchReport {
  const final = replayMatch(config, history);
  const team = teamOf(seat);
  const decisions = extractDecisions(config, history, seat);

  const moments: KeyMoment[] = [];
  let judgedDecisions = 0;
  let mistakes = 0;

  for (const decision of decisions) {
    if (!JUDGED_TYPES.has(decision.action.type)) {
      continue;
    }
    judgedDecisions++;
    const findings = detectFindings(decision);
    if (findings.some((finding) => finding.severity === 'mistake')) {
      mistakes++;
    }
    const rivalCards = decision.revealedHands.filter((_, s) => teamOf(s) !== team).flat();
    for (const finding of findings) {
      const bluffWorked = finding.kind === 'bluff' ? decision.nextAction?.type === 'run' : null;
      moments.push({ finding, rivalCards, bluffWorked });
    }
  }

  const bluffMoments = moments.filter((moment) => moment.finding.kind === 'bluff');
  return {
    won: final.winner === team,
    myScore: final.scores[team],
    theirScore: final.scores[team === 0 ? 1 : 0],
    handsPlayed: final.handNumber,
    judgedDecisions,
    mistakes,
    quality: judgedDecisions === 0 ? 100 : Math.round((100 * (judgedDecisions - mistakes)) / judgedDecisions),
    bluffs: {
      attempts: bluffMoments.length,
      successes: bluffMoments.filter((moment) => moment.bluffWorked).length,
    },
    moments,
  };
}
