// FROZEN COPY of the first bot, for tests only (the arena measures new bots against it).
// Do not improve this file: improvements go in bot.ts.

import { cardStrength, MAX_CARD_STRENGTH } from '../engine/card';
import { AcceptAction, HandAction, PlayCardAction, RaiseAction, RunAction, Stake, STAKES, teamOf } from '../engine/hand';
import { Rng } from '../engine/random';
import { signalMatchesCard, signalStrength, truthfulSignal } from '../engine/signals';
import { PlayerView } from '../engine/view';

interface BotParams {
  /** 0..1. Higher = asks for truco and accepts bets with weaker hands. */
  readonly aggressiveness: number;
  /** 0..1. Chance of acting strong with a weak hand. */
  readonly bluffChance: number;
}

const BASELINE_PARAMS: BotParams = { aggressiveness: 0.5, bluffChance: 0.1 };

/** Bonus/penalty to hand strength for each round already won/lost. */
const ROUND_WEIGHT = 0.15;

/** Max bonus (partner) or penalty (rival) from a known signal of the strongest card. */
const SIGNAL_WEIGHT = 0.4;

export function chooseBaselineAction(
  view: PlayerView,
  legal: readonly HandAction[],
  rng: Rng,
  params: BotParams = BASELINE_PARAMS,
): HandAction {
  if (legal.length === 0) {
    throw new Error('Bot asked to act with no legal actions');
  }
  // Signal round: always tell the truth about the best card.
  if (legal[0].type === 'signal') {
    const honest = truthfulSignal(view.ownCards);
    return legal.find((a) => a.type === 'signal' && a.signal === honest) ?? legal[0];
  }

  const strength = handStrength(view);
  const accept = legal.find((a): a is AcceptAction => a.type === 'accept');
  const run = legal.find((a): a is RunAction => a.type === 'run');
  const raise = legal.find((a): a is RaiseAction => a.type === 'raise');

  // Mão de 11 decision, or answering a bet.
  if (accept && run) {
    return answer(view, strength, params, rng, accept, run, raise);
  }

  // Own turn. Never ask for truco outside a normal hand: it would lose the hand.
  if (raise && view.mode.kind === 'normal' && wantsToRaise(strength, params, rng)) {
    return raise;
  }
  const plays = legal.filter((a): a is PlayCardAction => a.type === 'playCard');
  return choosePlay(view, plays, rng);
}

/**
 * 0..1: average strength of the cards still held, plus a bonus per round won
 * and a penalty per round lost, adjusted by the signals the bot knows about.
 * 0.5 when the bot can't see its cards (mão de ferro).
 */
function handStrength(view: PlayerView): number {
  if (view.ownCards.length === 0) {
    return 0.5;
  }
  const total = view.ownCards.reduce((sum, card) => sum + cardStrength(card) / MAX_CARD_STRENGTH, 0);
  const average = total / view.ownCards.length;

  const won = view.completedRounds.filter((round) => round.result === view.team).length;
  const lost = view.completedRounds.filter(
    (round) => round.result !== 'tie' && round.result !== view.team,
  ).length;

  return clamp(average + ROUND_WEIGHT * won - ROUND_WEIGHT * lost + signalAdjustment(view), 0, 1);
}

/**
 * Partner announced a strong card still in hand: stronger team. A rival's signal we caught:
 * weaker. Scaled by how strong the announced card is. Cards already played don't count.
 */
function signalAdjustment(view: PlayerView): number {
  const played = [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays];
  let adjustment = 0;
  for (const known of view.knownSignals) {
    if (known.seat === view.seat || known.signal === 'nothing') {
      continue;
    }
    const alreadyPlayed = played.some(
      (play) => play.seat === known.seat && signalMatchesCard(known.signal, play.card),
    );
    if (alreadyPlayed) {
      continue;
    }
    const weight = SIGNAL_WEIGHT * (signalStrength(known.signal) / MAX_CARD_STRENGTH);
    adjustment += teamOf(known.seat) === view.team ? weight : -weight;
  }
  return adjustment;
}

function raiseThreshold(params: BotParams): number {
  return 0.75 - 0.3 * params.aggressiveness;
}

/** Higher bets need a slightly stronger hand to accept. */
function acceptThreshold(params: BotParams, requested: Stake): number {
  const levelsAboveTruco = STAKES.indexOf(requested) - 1;
  return 0.55 - 0.3 * params.aggressiveness + 0.05 * levelsAboveTruco;
}

function wantsToRaise(strength: number, params: BotParams, rng: Rng): boolean {
  return strength >= raiseThreshold(params) || rng() < params.bluffChance;
}

function answer(
  view: PlayerView,
  strength: number,
  params: BotParams,
  rng: Rng,
  accept: AcceptAction,
  run: RunAction,
  raise: RaiseAction | undefined,
): HandAction {
  // Mão de 11: play (worth 3) or run.
  if (view.elevenDeciderSeat === view.seat) {
    return strength >= acceptThreshold(params, 3) ? accept : run;
  }

  const requested = view.pendingBet?.requested ?? 3;
  if (raise && strength >= raiseThreshold(params) + 0.15) {
    return raise;
  }
  if (strength >= acceptThreshold(params, requested)) {
    return accept;
  }
  return rng() < params.bluffChance ? accept : run;
}

function choosePlay(view: PlayerView, plays: readonly PlayCardAction[], rng: Rng): PlayCardAction {
  // Mão de ferro: the bot can't see its cards, so any card is a guess.
  if (view.mode.kind === 'iron') {
    return plays[Math.floor(rng() * plays.length)];
  }

  const weakestFirst = [...plays].sort((a, b) => cardStrength(a.card) - cardStrength(b.card));
  const weakest = weakestFirst[0];
  const strongest = weakestFirst[weakestFirst.length - 1];

  // Opening a round: middle card in the first round, strongest afterwards.
  if (view.currentPlays.length === 0) {
    if (view.completedRounds.length === 0) {
      return weakestFirst[Math.floor((weakestFirst.length - 1) / 2)];
    }
    return strongest;
  }

  const best = view.currentPlays.reduce((a, b) => (cardStrength(b.card) > cardStrength(a.card) ? b : a));
  if (teamOf(best.seat) === view.team) {
    return weakest; // partner is already winning the round
  }
  // Cheapest card that wins; if none, throw away the weakest.
  const cheapestWinner = weakestFirst.find((play) => cardStrength(play.card) > cardStrength(best.card));
  return cheapestWinner ?? weakest;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
