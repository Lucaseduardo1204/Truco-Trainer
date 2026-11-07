// Phase 3: Monte Carlo statistics.
// From what ONE player knows (their PlayerView), estimate how each of their options plays out:
// deal the hidden cards at random many times, play the rest of the hand with the bot in every
// seat, and count. Pure TypeScript, no Angular. Seeded: same seed, same numbers.

import { chooseAction, DEFAULT_BOT } from '../bot/bot';
import { Card, CARDS_PER_HAND } from '../engine/card';
import { HandAction, HandState, SignalEntry, Team } from '../engine/hand';
import { applyMatchAction, getMatchLegalActions, HistoryEntry, MatchState } from '../engine/match';
import { unseenCards } from '../engine/odds';
import { createRng, Rng, shuffle } from '../engine/random';
import { getPlayerView, PlayerView } from '../engine/view';

/** How one option did across all the simulated deals. */
export interface OptionStats {
  readonly action: HandAction;
  /** 0..1: share of deals where the player's team won the hand. */
  readonly winChance: number;
  /** Average points for the player's team (a loss counts as minus the hand's value). */
  readonly expectedPoints: number;
}

export interface SimulationResult {
  /** One entry per option that can be judged, in the order the engine listed them. */
  readonly options: readonly OptionStats[];
  /** The option with the most expected points (ties: higher win chance). null if none. */
  readonly best: HandAction | null;
  /** How many hidden-card deals were simulated. */
  readonly samples: number;
}

/**
 * Deals to simulate per decision, by number of players. Measured (start of a hand, the worst
 * case): ~70 ms in 1x1 and ~115 ms in 2x2, with about ±2 points of noise.
 */
export const RECOMMENDED_SAMPLES = { 2: 1000, 4: 500 } as const;

/** Options the simulation judges. Signals and table talk are about information, not cards. */
const SIMULATED_TYPES = new Set(['playCard', 'raise', 'accept', 'run']);

/**
 * Simulates each of `legal` (the player's options right now) over `samples` random deals of the
 * cards the player can't see. Every option faces the SAME deals ("common random numbers"), so the
 * differences between options come from the decision, not from luck.
 */
export function simulateOptions(
  view: PlayerView,
  legal: readonly HandAction[],
  samples: number,
  seed: number,
): SimulationResult {
  const options = legal.filter((action) => action.seat === view.seat && SIMULATED_TYPES.has(action.type));
  // During the signal round the hand hasn't really started: nothing to simulate yet.
  if (options.length === 0 || view.signalingSeat !== null || view.handFinished) {
    return { options: [], best: null, samples: 0 };
  }

  const wins = new Array<number>(options.length).fill(0);
  const points = new Array<number>(options.length).fill(0);

  for (let sample = 0; sample < samples; sample++) {
    const dealRng = createRng(seed * 1_000_003 + sample);
    const imagined = imaginedMatch(view, sampleHiddenHands(view, dealRng));
    options.forEach((option, i) => {
      // Same rollout seed for every option: only the decision differs.
      const outcome = rollOut(imagined, option, createRng(seed * 7_919 + sample), view.team);
      wins[i] += outcome.won ? 1 : 0;
      points[i] += outcome.points;
    });
  }

  const stats = options.map((action, i) => ({
    action,
    winChance: wins[i] / samples,
    expectedPoints: points[i] / samples,
  }));
  const best = stats.reduce<OptionStats | null>((top, option) => {
    if (!top) {
      return option;
    }
    if (option.expectedPoints !== top.expectedPoints) {
      return option.expectedPoints > top.expectedPoints ? option : top;
    }
    return option.winChance > top.winChance ? option : top;
  }, null);

  return { options: stats, best: best?.action ?? null, samples };
}

/**
 * One random deal of the cards the player can't see, consistent with everything they saw:
 * each seat gets as many cards as it still holds, drawn from the unseen pile. The player keeps
 * their own cards (except in mão de ferro, where they can't see them either).
 */
export function sampleHiddenHands(view: PlayerView, rng: Rng): Card[][] {
  const pile = shuffle(unseenCards(view), rng);
  const hands: Card[][] = [];
  let next = 0;
  for (let seat = 0; seat < view.playerCount; seat++) {
    if (seat === view.seat && view.ownCards.length > 0) {
      hands.push([...view.ownCards]);
      continue;
    }
    const count = cardsLeft(view, seat);
    hands.push(pile.slice(next, next + count));
    next += count;
  }
  return hands;
}

/** Plays `first`, then lets the bot play every seat until the hand ends. */
function rollOut(start: MatchState, first: HandAction, rng: Rng, team: Team): { won: boolean; points: number } {
  let state = applyMatchAction(start, first);
  while (!state.hand.finished) {
    const legal = getMatchLegalActions(state);
    const seat = legal[0].seat;
    state = applyMatchAction(state, chooseAction(getPlayerView(state, seat), legal, DEFAULT_BOT, rng));
  }
  const { winner, stake } = state.hand;
  if (winner === null) {
    return { won: false, points: 0 };
  }
  return winner === team ? { won: true, points: stake } : { won: false, points: -stake };
}

/**
 * A match that looks exactly like what the player sees, with the hidden cards filled in by one
 * random deal. Built from public information only, so it never leaks what the player can't know.
 */
function imaginedMatch(view: PlayerView, hands: Card[][]): MatchState {
  const hand: HandState = {
    playerCount: view.playerCount,
    mode: view.mode,
    elevenDeciderSeat: view.elevenDeciderSeat,
    signalingSeat: null,
    // Signals the player knows about, as seen by the signaler's partner and by the player.
    signals: view.knownSignals.map(
      (known): SignalEntry => ({
        seat: known.seat,
        signal: known.signal,
        seenBy: [(known.seat + 2) % 4, view.seat].filter((s) => s !== known.seat),
      }),
    ),
    signalWatchers: [],
    hands,
    leadSeat: view.leadSeat,
    currentPlays: view.currentPlays,
    completedRounds: view.completedRounds,
    stake: view.stake,
    pendingBet: view.pendingBet,
    raiseHolder: view.raiseHolder,
    pendingQuestion: view.pendingQuestion,
    talk: view.talk,
    finished: false,
    winner: null,
  };
  // Raises so far, so the bots can "read the bets" in the simulated rest of the hand.
  const history: HistoryEntry[] = view.raisedBy.map((seat) => ({
    handNumber: view.handNumber,
    action: { type: 'raise', seat },
  }));
  return {
    config: { playerCount: view.playerCount, targetScore: view.targetScore, seed: 0 },
    scores: view.scores,
    handNumber: view.handNumber,
    starterSeat: view.starterSeat,
    hand,
    history,
    finished: false,
    winner: null,
  };
}

/** 3 minus the cards this seat already put on the table. */
function cardsLeft(view: PlayerView, seat: number): number {
  const plays = [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays];
  return CARDS_PER_HAND - plays.filter((play) => play.seat === seat).length;
}
