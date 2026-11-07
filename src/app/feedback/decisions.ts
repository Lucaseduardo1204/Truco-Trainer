// Feedback analyzer, step 1: rebuild a finished match and pull out one player's decisions.
// Pure TypeScript, no Angular.

import { Card } from '../engine/card';
import { HandAction } from '../engine/hand';
import {
  applyMatchAction,
  createMatch,
  getMatchLegalActions,
  HistoryEntry,
  MatchConfig,
  startNextHand,
} from '../engine/match';
import { getPlayerView, PlayerView } from '../engine/view';

/** One decision taken by the analyzed player, with everything needed to judge it. */
export interface DecisionPoint {
  /** Position of this action in the match history. */
  readonly historyIndex: number;
  readonly handNumber: number;
  /** What the player could see right before deciding. Scoring uses only this. */
  readonly view: PlayerView;
  /** The options the engine offered at that moment. */
  readonly legal: readonly HandAction[];
  /** What the player chose. */
  readonly action: HandAction;
  /** The very next action in the same hand, by anyone (e.g. the reply to a truco). null if none. */
  readonly nextAction: HandAction | null;
  /**
   * Every seat's cards at that moment (hidden from the player then).
   * Only for "what they really had" curiosities in the report, never for scoring.
   */
  readonly revealedHands: readonly (readonly Card[])[];
}

/**
 * Replays the match from its seed and history, and returns the decisions of `seat`,
 * in order. Throws if the history doesn't fit the config (the engine rejects it).
 */
export function extractDecisions(
  config: MatchConfig,
  history: readonly HistoryEntry[],
  seat: number,
): DecisionPoint[] {
  const decisions: DecisionPoint[] = [];
  let state = createMatch(config);

  history.forEach((entry, historyIndex) => {
    if (entry.handNumber !== state.handNumber) {
      state = startNextHand(state);
    }
    if (entry.action.seat === seat) {
      const next = history[historyIndex + 1];
      decisions.push({
        historyIndex,
        handNumber: entry.handNumber,
        view: getPlayerView(state, seat),
        legal: getMatchLegalActions(state),
        action: entry.action,
        nextAction: next && next.handNumber === entry.handNumber ? next.action : null,
        revealedHands: state.hand.hands,
      });
    }
    state = applyMatchAction(state, entry.action);
  });

  return decisions;
}
