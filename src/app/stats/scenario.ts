// Phase 3 lab: turn a situation the player sets up into a real engine state.
// First version: first round only. Pure TypeScript, no Angular.

import { Card, createDeck, isSameCard, PlayerCount } from '../engine/card';
import { createHand, getLegalActions, HandAction, HandState, Play, Stake } from '../engine/hand';
import { handModeFor, HistoryEntry, MatchState, TargetScore } from '../engine/match';
import { getPlayerView, PlayerView } from '../engine/view';

/** The player is always seat 0, like at the table. */
const ME = 0;

/** What the player sets up in the lab. */
export interface Scenario {
  readonly playerCount: PlayerCount;
  readonly targetScore: TargetScore;
  /** [my team, their team] */
  readonly scores: readonly [number, number];
  /** The player's three cards. */
  readonly myCards: readonly Card[];
  /**
   * Cards already played in this (first) round, in order. With a bet asked, these are the
   * cards played before the asking rival (who asks on their turn, before playing).
   */
  readonly tableCards: readonly Card[];
  /**
   * A bet the rival right before the player is asking for, or null for none.
   * Rules: you can only ask on your own turn, before your card, so that rival hasn't played yet.
   */
  readonly betAsked: Exclude<Stake, 1> | null;
}

export type ScenarioResult =
  | { readonly ok: true; readonly view: PlayerView; readonly legal: readonly HandAction[] }
  | { readonly ok: false; readonly error: string };

/** The value the hand had before each bet was asked: truco from 1, seis from 3... */
const VALUE_BEFORE: Record<Exclude<Stake, 1>, Stake> = { 3: 1, 6: 3, 9: 6, 12: 9 };

/**
 * Builds the situation as the engine would have it: the player's view and their legal options.
 * Other players' hidden cards get placeholder cards; the simulator re-deals them anyway.
 */
export function buildScenario(scenario: Scenario): ScenarioResult {
  const error = validate(scenario);
  if (error) {
    return { ok: false, error };
  }
  const { playerCount, tableCards } = scenario;

  // The round was opened by the seat `tableCards.length` seats back, counting the asking rival
  // (who hasn't played yet) when there's a bet.
  const seatsBefore = tableCards.length + (scenario.betAsked !== null ? 1 : 0);
  const leadSeat = (playerCount - seatsBefore) % playerCount;
  const currentPlays: Play[] = tableCards.map((card, i) => ({ seat: (leadSeat + i) % playerCount, card }));

  const hands = dealAround(scenario, currentPlays);
  const mode = handModeFor(scenario.scores, scenario.targetScore);
  const base = createHand(playerCount, hands, leadSeat, mode);

  let hand: HandState = {
    ...base,
    // The table cards are already played: take them out of their players' hands.
    hands: hands.map((held, seat) => held.filter((card) => !currentPlays.some((p) => p.seat === seat && isSameCard(p.card, card)))),
    currentPlays,
  };
  // Mão de 11 with cards already on the table: the team on 11 already chose to play (worth 3).
  if (mode.kind === 'eleven' && currentPlays.length > 0) {
    hand = { ...hand, elevenDeciderSeat: null, stake: 3 };
  }

  const history: HistoryEntry[] = [];
  if (scenario.betAsked !== null) {
    const callerSeat = playerCount - 1; // the rival right before the player
    hand = {
      ...hand,
      stake: VALUE_BEFORE[scenario.betAsked],
      pendingBet: { requested: scenario.betAsked, callerSeat, responderSeat: ME },
    };
    history.push({ handNumber: 1, action: { type: 'raise', seat: callerSeat } });
  }

  const match: MatchState = {
    config: { playerCount, targetScore: scenario.targetScore, seed: 0 },
    scores: [scenario.scores[0], scenario.scores[1]],
    handNumber: 1,
    starterSeat: leadSeat,
    hand,
    history,
    finished: false,
    winner: null,
  };
  const legal = getLegalActions(hand).filter((action) => action.seat === ME);
  if (legal.length === 0) {
    // E.g. the rivals' mão de 11 before any card: they decide first.
    return { ok: false, error: 'Nessa situação ainda não é a sua vez de decidir.' };
  }
  return { ok: true, view: getPlayerView(match, ME), legal };
}

/** A player-language error, or null when the situation is valid. */
function validate(s: Scenario): string | null {
  if (s.myCards.length !== 3) {
    return 'Escolha as suas 3 cartas.';
  }
  const seatsBefore = s.tableCards.length + (s.betAsked !== null ? 1 : 0);
  if (seatsBefore > s.playerCount - 1) {
    return s.betAsked !== null
      ? 'Quem pede truco ainda não jogou: tire uma carta da mesa.'
      : 'Cartas demais na mesa para esse formato.';
  }
  const all = [...s.myCards, ...s.tableCards];
  if (all.some((card, i) => all.findIndex((other) => isSameCard(card, other)) !== i)) {
    return 'A mesma carta aparece duas vezes.';
  }
  const [mine, theirs] = s.scores;
  if ([mine, theirs].some((score) => score < 0 || score >= s.targetScore || !Number.isInteger(score))) {
    return `O placar vai de 0 a ${s.targetScore - 1}.`;
  }
  const mode = handModeFor([mine, theirs], s.targetScore);
  if (s.betAsked !== null && mode.kind !== 'normal') {
    return 'Na mão de 11 e na mão de ferro não tem truco.';
  }
  return null;
}

/** Everyone's hands: the player's cards, each table card in its player's hand, fillers for the rest. */
function dealAround(s: Scenario, plays: readonly Play[]): Card[][] {
  const used = [...s.myCards, ...s.tableCards];
  const fillers = createDeck().filter((card) => !used.some((u) => isSameCard(u, card)));
  let next = 0;
  const hands: Card[][] = [];
  for (let seat = 0; seat < s.playerCount; seat++) {
    if (seat === ME) {
      hands.push([...s.myCards]);
      continue;
    }
    const played = plays.filter((p) => p.seat === seat).map((p) => p.card);
    const missing = 3 - played.length;
    hands.push([...played, ...fillers.slice(next, next + missing)]);
    next += missing;
  }
  return hands;
}
