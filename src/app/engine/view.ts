// Pure TypeScript: no Angular imports allowed in src/app/engine.

import { Card, PlayerCount } from './card';
import { FirstRoundTalk, HandMode, HandState, PendingBet, Play, Round, Stake, Team, teamOf } from './hand';
import { MatchState, TargetScore } from './match';
import { announcedCards, Signal, signalMatchesCard } from './signals';

export interface KnownSignal {
  readonly seat: number;
  readonly signal: Signal;
}

/**
 * Everything one seat is allowed to know. Other players' cards are never here.
 * Bots (and later the feedback) decide from this, never from the full MatchState.
 */
export interface PlayerView {
  readonly seat: number;
  readonly team: Team;
  readonly playerCount: PlayerCount;
  readonly targetScore: TargetScore;
  readonly scores: readonly [number, number];
  readonly handNumber: number;
  readonly starterSeat: number;
  readonly mode: HandMode;
  /** Own cards still held. Empty in mão de ferro: everyone plays blind. */
  readonly ownCards: readonly Card[];
  readonly leadSeat: number;
  readonly currentPlays: readonly Play[];
  readonly completedRounds: readonly Round[];
  readonly stake: Stake;
  readonly pendingBet: PendingBet | null;
  readonly raiseHolder: Team | null;
  readonly elevenDeciderSeat: number | null;
  /** Seat whose turn it is in the signal round (2x2), or null. */
  readonly signalingSeat: number | null;
  /** Signals this seat knows: its own, its partner's, and rivals' it caught. */
  readonly knownSignals: readonly KnownSignal[];
  /** Seats that asked for truco (or raised) in this hand, in order. Public: everyone hears it. */
  readonly raisedBy: readonly number[];
  /** "Faz a primeira?" waiting for an answer. Public. */
  readonly pendingQuestion: HandState['pendingQuestion'];
  /** Every "faz a primeira?" answered in this hand. Public: it's spoken out loud. */
  readonly talk: readonly FirstRoundTalk[];
  readonly handFinished: boolean;
  /** null while in progress, or if all 3 rounds tied. */
  readonly handWinner: Team | null;
  readonly matchFinished: boolean;
  readonly matchWinner: Team | null;
}

/**
 * What `seat` announced with its signal (if the viewer saw it), minus what it has already played:
 * each played card matching the signal uses up one announced card.
 */
export function remainingAnnouncedCards(view: PlayerView, seat: number): Card[] {
  const known = view.knownSignals.find((s) => s.seat === seat);
  if (!known) {
    return [];
  }
  const plays = [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays];
  const usedUp = plays.filter((p) => p.seat === seat && signalMatchesCard(known.signal, p.card)).length;
  return announcedCards(known.signal).slice(usedUp);
}

/** The viewer's partner (2x2 only; null in 1x1). */
export function partnerOf(view: PlayerView): number | null {
  return view.playerCount === 4 ? (view.seat + 2) % 4 : null;
}

/**
 * The partner signaled "deixa comigo" and the viewer didn't say it too.
 * (If both did, each would wait for the other, so neither counts.)
 */
export function partnerSaidLeaveItToMe(view: PlayerView): boolean {
  const partner = partnerOf(view);
  const said = (seat: number) => view.knownSignals.some((s) => s.seat === seat && s.signal === 'leaveItToMe');
  return partner !== null && said(partner) && !said(view.seat);
}

export function getPlayerView(match: MatchState, seat: number): PlayerView {
  const hand = match.hand;
  return {
    seat,
    team: teamOf(seat),
    playerCount: match.config.playerCount,
    targetScore: match.config.targetScore,
    scores: match.scores,
    handNumber: match.handNumber,
    starterSeat: match.starterSeat,
    mode: hand.mode,
    ownCards: hand.mode.kind === 'iron' ? [] : hand.hands[seat],
    leadSeat: hand.leadSeat,
    currentPlays: hand.currentPlays,
    completedRounds: hand.completedRounds,
    stake: hand.stake,
    pendingBet: hand.pendingBet,
    raiseHolder: hand.raiseHolder,
    elevenDeciderSeat: hand.elevenDeciderSeat,
    signalingSeat: hand.signalingSeat,
    knownSignals: hand.signals
      .filter((entry) => entry.signal !== null && (entry.seat === seat || entry.seenBy.includes(seat)))
      .map((entry) => ({ seat: entry.seat, signal: entry.signal! })),
    raisedBy: match.history
      .filter((entry) => entry.handNumber === match.handNumber && entry.action.type === 'raise')
      .map((entry) => entry.action.seat),
    pendingQuestion: hand.pendingQuestion,
    talk: hand.talk,
    handFinished: hand.finished,
    handWinner: hand.winner,
    matchFinished: match.finished,
    matchWinner: match.winner,
  };
}
