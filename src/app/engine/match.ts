// Pure TypeScript: no Angular imports allowed in src/app/engine.

import { createDeck, dealHands, PlayerCount } from './card';
import { applyAction, createHand, getLegalActions, HandAction, HandMode, HandState, Team } from './hand';
import { createRng, Rng, shuffle } from './random';

export type TargetScore = 12 | 24;

/** Chance that a rival catches a signal (rolled per rival, per seat, per hand). */
export const SIGNAL_CATCH_CHANCE = 0.25;

export interface MatchConfig {
  readonly playerCount: PlayerCount;
  readonly targetScore: TargetScore;
  /** Same seed => same deals and same first "mão". */
  readonly seed: number;
}

/** One decision taken in the match. Seed + history is enough to rebuild any moment (replay). */
export interface HistoryEntry {
  readonly handNumber: number;
  readonly action: HandAction;
}

export interface MatchState {
  readonly config: MatchConfig;
  /** Points per team: scores[0] for team 0, scores[1] for team 1. */
  readonly scores: readonly [number, number];
  /** 1 for the first hand, 2 for the second... */
  readonly handNumber: number;
  /** Seat that is "mão" (plays first) in the current hand. */
  readonly starterSeat: number;
  readonly hand: HandState;
  /** Every action applied so far, by every player, in order. */
  readonly history: readonly HistoryEntry[];
  readonly finished: boolean;
  readonly winner: Team | null;
}

export function createMatch(config: MatchConfig): MatchState {
  const starterSeat = Math.floor(createRng(config.seed)() * config.playerCount);
  const scores = [0, 0] as const;
  return {
    config,
    scores,
    handNumber: 1,
    starterSeat,
    hand: dealHand(config, 1, starterSeat, scores),
    history: [],
    finished: false,
    winner: null,
  };
}

/** Rebuilds a match from its config (seed) and history alone. */
export function replayMatch(config: MatchConfig, history: readonly HistoryEntry[]): MatchState {
  let state = createMatch(config);
  for (const entry of history) {
    if (entry.handNumber !== state.handNumber) {
      state = startNextHand(state);
    }
    state = applyMatchAction(state, entry.action);
  }
  return state;
}

export function getMatchLegalActions(state: MatchState): HandAction[] {
  return state.finished ? [] : getLegalActions(state.hand);
}

/**
 * Applies an action to the current hand. When the hand ends, adds its points to the score.
 * The next hand is NOT dealt automatically: call startNextHand (lets the UI show the result first).
 */
export function applyMatchAction(state: MatchState, action: HandAction): MatchState {
  if (state.finished) {
    throw new Error('Match is over');
  }
  const hand = applyAction(state.hand, action);
  const history = [...state.history, { handNumber: state.handNumber, action }];
  if (!hand.finished) {
    return { ...state, hand, history };
  }

  const scores = hand.winner === null ? state.scores : addPoints(state.scores, hand.winner, hand.stake);
  const winner = winnerOf(scores, state.config.targetScore);
  return { ...state, hand, history, scores, finished: winner !== null, winner };
}

/** Deals the next hand; "mão" moves to the next seat. */
export function startNextHand(state: MatchState): MatchState {
  if (state.finished || !state.hand.finished) {
    throw new Error('Current hand is not over, or the match is over');
  }
  const handNumber = state.handNumber + 1;
  const starterSeat = (state.starterSeat + 1) % state.config.playerCount;
  return {
    ...state,
    handNumber,
    starterSeat,
    hand: dealHand(state.config, handNumber, starterSeat, state.scores),
  };
}

/** Mão de 11 when one team is one point from winning; mão de ferro when both are. */
export function handModeFor(scores: readonly [number, number], targetScore: TargetScore): HandMode {
  const almost = targetScore - 1;
  const team0Almost = scores[0] === almost;
  const team1Almost = scores[1] === almost;
  if (team0Almost && team1Almost) {
    return { kind: 'iron' };
  }
  if (team0Almost) {
    return { kind: 'eleven', team: 0 };
  }
  if (team1Almost) {
    return { kind: 'eleven', team: 1 };
  }
  return { kind: 'normal' };
}

function dealHand(
  config: MatchConfig,
  handNumber: number,
  starterSeat: number,
  scores: readonly [number, number],
): HandState {
  const rng = createRng(config.seed + handNumber);
  const deck = shuffle(createDeck(), rng);
  const hands = dealHands(deck, config.playerCount);
  const mode = handModeFor(scores, config.targetScore);
  // Signal round only in 2x2 normal hands. Same rng: who catches what is part of the deal.
  const watchers = config.playerCount === 4 && mode.kind === 'normal' ? rollSignalWatchers(rng) : null;
  return createHand(config.playerCount, hands, starterSeat, mode, watchers);
}

/** For each seat (2x2): its partner always sees its signal; each rival sees it with SIGNAL_CATCH_CHANCE. */
function rollSignalWatchers(rng: Rng): number[][] {
  const watchers: number[][] = [];
  for (let seat = 0; seat < 4; seat++) {
    const partner = (seat + 2) % 4;
    const rivals = [(seat + 1) % 4, (seat + 3) % 4];
    watchers.push([partner, ...rivals.filter(() => rng() < SIGNAL_CATCH_CHANCE)]);
  }
  return watchers;
}

function addPoints(scores: readonly [number, number], team: Team, points: number): [number, number] {
  return team === 0 ? [scores[0] + points, scores[1]] : [scores[0], scores[1] + points];
}

function winnerOf(scores: readonly [number, number], targetScore: TargetScore): Team | null {
  if (scores[0] >= targetScore) {
    return 0;
  }
  if (scores[1] >= targetScore) {
    return 1;
  }
  return null;
}
