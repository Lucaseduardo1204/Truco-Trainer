// Pure TypeScript: no Angular imports allowed in src/app/engine.

import { Card, cardStrength, isSameCard, PlayerCount } from './card';
import { Signal, SIGNALS } from './signals';

/** Seats 0 and 2 are team 0; seats 1 and 3 are team 1. */
export type Team = 0 | 1;

export type RoundResult = Team | 'tie';

export interface Play {
  readonly seat: number;
  readonly card: Card;
}

export interface Round {
  readonly plays: readonly Play[];
  readonly result: RoundResult;
}

/** Hand values in order: no bet, truco, seis, nove, doze. */
export const STAKES = [1, 3, 6, 9, 12] as const;
export type Stake = (typeof STAKES)[number];

export interface PendingBet {
  /** Value being asked for (3 = truco, 6 = seis, ...). */
  readonly requested: Stake;
  readonly callerSeat: number;
  /** Only this seat may accept, run or raise again. */
  readonly responderSeat: number;
}

export interface SignalEntry {
  readonly seat: number;
  /** null = stayed quiet. */
  readonly signal: Signal | null;
  /** Seats that saw it: the partner always, rivals only if they caught it. */
  readonly seenBy: readonly number[];
}

/**
 * normal: regular hand.
 * eleven: `team` is one point from winning ("mão de 11"/"mão de 23").
 * iron: both teams are one point from winning ("mão de ferro").
 */
export type HandMode =
  | { readonly kind: 'normal' }
  | { readonly kind: 'eleven'; readonly team: Team }
  | { readonly kind: 'iron' };

/** State of a single "mão" (best of 3 rounds). Never mutated: actions return a new state. */
export interface HandState {
  readonly playerCount: PlayerCount;
  readonly mode: HandMode;
  /** Mão de 11 only: seat that must choose to play (accept) or run before any card. */
  readonly elevenDeciderSeat: number | null;
  /** Seat whose turn it is in the signal round at the start of the hand. null = no signal round now. */
  readonly signalingSeat: number | null;
  readonly signals: readonly SignalEntry[];
  /** For each seat, who will see its signal this hand (decided by the match when dealing). */
  readonly signalWatchers: readonly (readonly number[])[];
  /** Cards still held, indexed by seat. */
  readonly hands: readonly (readonly Card[])[];
  /** Seat that opens the current round. */
  readonly leadSeat: number;
  /** Cards already played in the current (unfinished) round. */
  readonly currentPlays: readonly Play[];
  readonly completedRounds: readonly Round[];
  /** Accepted value of the hand. Also what the winner gets if the other team runs. */
  readonly stake: Stake;
  /** Bet waiting for an answer. While set, no card can be played. */
  readonly pendingBet: PendingBet | null;
  /** Team allowed to ask for the next raise. null = either team (nobody asked yet). */
  readonly raiseHolder: Team | null;
  readonly finished: boolean;
  /** Team that won the hand. null while in progress, or if all 3 rounds tied. */
  readonly winner: Team | null;
}

export interface PlayCardAction {
  readonly type: 'playCard';
  readonly seat: number;
  readonly card: Card;
}

/** Ask for the next stake: truco, seis, nove or doze. */
export interface RaiseAction {
  readonly type: 'raise';
  readonly seat: number;
}

export interface AcceptAction {
  readonly type: 'accept';
  readonly seat: number;
}

export interface RunAction {
  readonly type: 'run';
  readonly seat: number;
}

/** A turn in the signal round. `signal: null` = stay quiet. */
export interface SignalAction {
  readonly type: 'signal';
  readonly seat: number;
  readonly signal: Signal | null;
}

export type HandAction = PlayCardAction | RaiseAction | AcceptAction | RunAction | SignalAction;

export function teamOf(seat: number): Team {
  return seat % 2 === 0 ? 0 : 1;
}

export function otherTeam(team: Team): Team {
  return team === 0 ? 1 : 0;
}

/**
 * `signalWatchers`: pass it (one list per seat) to start the hand with a signal round;
 * leave it null for no signals (1x1, mão de 11, mão de ferro).
 */
export function createHand(
  playerCount: PlayerCount,
  hands: readonly (readonly Card[])[],
  leadSeat: number,
  mode: HandMode = { kind: 'normal' },
  signalWatchers: readonly (readonly number[])[] | null = null,
): HandState {
  if (hands.length !== playerCount) {
    throw new Error(`Expected ${playerCount} hands, got ${hands.length}`);
  }
  return {
    playerCount,
    mode,
    elevenDeciderSeat: mode.kind === 'eleven' ? elevenDecider(leadSeat, mode.team, playerCount) : null,
    signalingSeat: signalWatchers ? leadSeat : null,
    signals: [],
    signalWatchers: signalWatchers ?? [],
    hands,
    leadSeat,
    currentPlays: [],
    completedRounds: [],
    stake: 1,
    pendingBet: null,
    raiseHolder: null,
    finished: false,
    winner: null,
  };
}

/** The player of `team` closest to being "mão": the lead seat, or the one right after it. */
function elevenDecider(leadSeat: number, team: Team, playerCount: PlayerCount): number {
  return teamOf(leadSeat) === team ? leadSeat : (leadSeat + 1) % playerCount;
}

/** Next value up the ladder, or null if already at 12. */
export function nextStake(stake: Stake): Stake | null {
  const index = STAKES.indexOf(stake);
  return index < STAKES.length - 1 ? STAKES[index + 1] : null;
}

export function currentSeat(state: HandState): number {
  return (state.leadSeat + state.currentPlays.length) % state.playerCount;
}

export function getLegalActions(state: HandState): HandAction[] {
  if (state.finished) {
    return [];
  }

  // Signal round: the signaling seat picks any signal (lying is allowed) or stays quiet.
  if (state.signalingSeat !== null) {
    const seat = state.signalingSeat;
    const options: (Signal | null)[] = [...SIGNALS, null];
    return options.map((signal) => ({ type: 'signal', seat, signal }));
  }

  // Mão de 11: the decider plays (accept) or runs before anything else.
  if (state.elevenDeciderSeat !== null) {
    const seat = state.elevenDeciderSeat;
    return [
      { type: 'accept', seat },
      { type: 'run', seat },
    ];
  }

  // A bet is waiting: only the responder acts.
  if (state.pendingBet) {
    const seat = state.pendingBet.responderSeat;
    const actions: HandAction[] = [
      { type: 'accept', seat },
      { type: 'run', seat },
    ];
    if (nextStake(state.pendingBet.requested) !== null) {
      actions.push({ type: 'raise', seat });
    }
    return actions;
  }

  const seat = currentSeat(state);
  const actions: HandAction[] = state.hands[seat].map((card) => ({ type: 'playCard', seat, card }));
  if (state.mode.kind !== 'normal') {
    // Offered on purpose: asking for truco here loses the hand (see raise()).
    actions.push({ type: 'raise', seat });
    return actions;
  }
  const mayRaise = state.raiseHolder === null || state.raiseHolder === teamOf(seat);
  if (mayRaise && nextStake(state.stake) !== null) {
    actions.push({ type: 'raise', seat });
  }
  return actions;
}

/** Throws if the action is not in getLegalActions(state): the engine is the authority. */
export function applyAction(state: HandState, action: HandAction): HandState {
  const isLegal = getLegalActions(state).some((legal) => isSameAction(legal, action));
  if (!isLegal) {
    throw new Error(`Illegal action: ${JSON.stringify(action)}`);
  }

  switch (action.type) {
    case 'playCard':
      return playCard(state, action);
    case 'raise':
      return raise(state, action);
    case 'accept':
      return accept(state, action);
    case 'run':
      return run(state, action);
    case 'signal':
      return signal(state, action);
  }
}

function isSameAction(a: HandAction, b: HandAction): boolean {
  if (a.type !== b.type || a.seat !== b.seat) {
    return false;
  }
  if (a.type === 'playCard' && b.type === 'playCard') {
    return isSameCard(a.card, b.card);
  }
  if (a.type === 'signal' && b.type === 'signal') {
    return a.signal === b.signal;
  }
  return true;
}

/** Records the signal (and who saw it), then passes the signal turn on; ends after everyone. */
function signal(state: HandState, action: SignalAction): HandState {
  const entry: SignalEntry = {
    seat: action.seat,
    signal: action.signal,
    seenBy: action.signal === null ? [] : state.signalWatchers[action.seat],
  };
  const next = (action.seat + 1) % state.playerCount;
  return {
    ...state,
    signals: [...state.signals, entry],
    signalingSeat: next === state.leadSeat ? null : next,
  };
}

function raise(state: HandState, action: RaiseAction): HandState {
  // No truco in mão de 11 or mão de ferro: asking loses the hand at its current value.
  if (state.mode.kind !== 'normal') {
    return { ...state, finished: true, winner: otherTeam(teamOf(action.seat)) };
  }

  // Raising on top of a pending bet implicitly accepts it.
  const stake = state.pendingBet ? state.pendingBet.requested : state.stake;
  const requested = nextStake(stake);
  if (requested === null) {
    throw new Error('Already at the highest stake'); // getLegalActions prevents this
  }
  return {
    ...state,
    stake,
    pendingBet: {
      requested,
      callerSeat: action.seat,
      responderSeat: (action.seat + 1) % state.playerCount,
    },
  };
}

function accept(state: HandState, action: AcceptAction): HandState {
  // Mão de 11: choosing to play makes the hand worth 3.
  if (state.elevenDeciderSeat !== null) {
    return { ...state, stake: 3, elevenDeciderSeat: null };
  }
  if (!state.pendingBet) {
    throw new Error('No bet to accept'); // getLegalActions prevents this
  }
  return {
    ...state,
    stake: state.pendingBet.requested,
    pendingBet: null,
    // Only the accepting team may ask for the next raise.
    raiseHolder: teamOf(action.seat),
  };
}

/**
 * Running ends the hand: the other team gets the current (already accepted) stake.
 * Also covers running from a mão de 11 (stake is still 1).
 */
function run(state: HandState, action: RunAction): HandState {
  return {
    ...state,
    pendingBet: null,
    elevenDeciderSeat: null,
    finished: true,
    winner: otherTeam(teamOf(action.seat)),
  };
}

function playCard(state: HandState, action: PlayCardAction): HandState {
  const hands = state.hands.map((hand, seat) =>
    seat === action.seat ? hand.filter((card) => !isSameCard(card, action.card)) : hand,
  );
  const currentPlays = [...state.currentPlays, { seat: action.seat, card: action.card }];

  // Round still waiting for other players.
  if (currentPlays.length < state.playerCount) {
    return { ...state, hands, currentPlays };
  }

  const { result, winningSeat } = resolveRound(currentPlays);
  const completedRounds = [...state.completedRounds, { plays: currentPlays, result }];
  const outcome = handOutcome(completedRounds.map((round) => round.result));

  return {
    ...state,
    hands,
    currentPlays: [],
    completedRounds,
    // After a tie, whoever opened the tied round opens the next one.
    leadSeat: winningSeat ?? state.leadSeat,
    finished: outcome.finished,
    winner: outcome.winner,
  };
}

/**
 * Rounds `team` still needs to take the hand, given the rounds played so far (cangou rules):
 * nothing played → 2; first round tied → 1; first won → 1; first lost → 2, or 1 after winning one back.
 */
export function roundsNeeded(rounds: readonly Round[], team: Team): number {
  const results = rounds.map((round) => round.result);
  if (results.length === 0) {
    return 2;
  }
  if (results[0] === 'tie') {
    return 1;
  }
  const wins = results.filter((result) => result === team).length;
  return Math.max(1, 2 - wins);
}

/** Who takes a round with these plays (the same rule the engine uses). For "what if" analysis. */
export function roundWinner(plays: readonly Play[]): RoundResult {
  return resolveRound(plays).result;
}

/**
 * The highest card wins. If the highest cards belong to both teams, it's a tie ("cangou").
 * If partners tie on the highest card, their team wins; the first of them to play it leads next.
 */
function resolveRound(plays: readonly Play[]): { result: RoundResult; winningSeat: number | null } {
  const best = Math.max(...plays.map((play) => cardStrength(play.card)));
  const topPlays = plays.filter((play) => cardStrength(play.card) === best);
  const topTeams = new Set(topPlays.map((play) => teamOf(play.seat)));

  if (topTeams.size > 1) {
    return { result: 'tie', winningSeat: null };
  }
  const first = topPlays[0];
  return { result: teamOf(first.seat), winningSeat: first.seat };
}

/** Applies the "cangou" rules from CLAUDE.md to the results so far. */
function handOutcome(results: readonly RoundResult[]): { finished: boolean; winner: Team | null } {
  const inProgress = { finished: false, winner: null };

  for (const team of [0, 1] as const) {
    if (results.filter((result) => result === team).length >= 2) {
      return { finished: true, winner: team };
    }
  }
  if (results.length < 2) {
    return inProgress;
  }

  const [first, second, third] = results;

  if (first !== 'tie') {
    // A later tie goes to whoever won the first round.
    if (second === 'tie' || third === 'tie') {
      return { finished: true, winner: first };
    }
    return inProgress; // 1–1, third round decides.
  }

  // First round tied: the next round with a winner decides.
  if (second !== 'tie') {
    return { finished: true, winner: second };
  }
  if (results.length === 3) {
    return { finished: true, winner: third === 'tie' ? null : third };
  }
  return inProgress;
}
