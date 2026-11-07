// Heuristic bot. Pure TypeScript, no Angular.
// It only ever returns one of the legal actions the engine gives it.

import { Card, cardStrength, CARDS_PER_HAND, MAX_CARD_STRENGTH } from '../engine/card';
import {
  AcceptAction,
  AskFirstAction,
  FirstRoundAnswer,
  HandAction,
  Play,
  PlayCardAction,
  RaiseAction,
  roundsNeeded,
  roundWinner,
  RunAction,
  teamOf,
} from '../engine/hand';
import { chanceBeatsHiddenCard, chanceRivalsHaveManilha, unseenCards } from '../engine/odds';
import { Rng } from '../engine/random';
import { truthfulSignal } from '../engine/signals';
import { partnerSaidLeaveItToMe, PlayerView, remainingAnnouncedCards } from '../engine/view';

export interface BotParams {
  /** 0..1. Higher = asks for truco and accepts bets with weaker hands. */
  readonly aggressiveness: number;
  /** 0..1. Chance of acting strong with a weak hand. */
  readonly bluffChance: number;
}

/** Calibrated in the arena against the baseline bot. */
export const DEFAULT_BOT: BotParams = { aggressiveness: 0.5, bluffChance: 0.3 };

/** Max penalty from a caught rival signal of the strongest card. */
const RIVAL_SIGNAL_WEIGHT = 0.4;

/**
 * How much each truco/raise from a rival in this hand lowers the win chance.
 * A rival who bets tends to hold good cards: their hand is not a random one anymore.
 * Calibrated in the arena.
 */
const BET_RESPECT = 0.2;

/**
 * Treating the team's cards as independent makes winChance a bit optimistic, so every
 * betting threshold asks for this much extra. Calibrated in the arena.
 */
const SAFETY_MARGIN = 0.1;

/** Bluffs only make sense when the rivals are unlikely to hold a manilha. */
const BLUFF_MAX_RIVAL_MANILHA_CHANCE = 0.4;

/** "Faz a primeira?": answer "faço" from this chance of taking the first round, "talvez" from the next. */
const ANSWER_YES_FROM = 0.6;
const ANSWER_MAYBE_FROM = 0.35;

export function chooseAction(
  view: PlayerView,
  legal: readonly HandAction[],
  params: BotParams,
  rng: Rng,
): HandAction {
  if (legal.length === 0) {
    throw new Error('Bot asked to act with no legal actions');
  }
  // Signal round: always tell the truth about the best card.
  if (legal[0].type === 'signal') {
    const honest = truthfulSignal(view.ownCards);
    return legal.find((a) => a.type === 'signal' && a.signal === honest) ?? legal[0];
  }
  // The partner asked "faz a primeira?": answer honestly.
  if (legal[0].type === 'answerFirst') {
    const honest = honestFirstRoundAnswer(view);
    return legal.find((a) => a.type === 'answerFirst' && a.answer === honest) ?? legal[0];
  }
  // Before playing in the first round, ask the partner when the bot can't take it itself.
  const askFirst = legal.find((a): a is AskFirstAction => a.type === 'askFirst');
  if (askFirst && firstRoundChance(view) < ANSWER_YES_FROM) {
    return askFirst;
  }

  const chance = winChance(view);
  const accept = legal.find((a): a is AcceptAction => a.type === 'accept');
  const run = legal.find((a): a is RunAction => a.type === 'run');
  const raise = legal.find((a): a is RaiseAction => a.type === 'raise');

  // Mão de 11 decision, or answering a bet.
  if (accept && run) {
    return answer(view, chance, params, rng, accept, run, raise);
  }

  // Own turn. Never ask for truco outside a normal hand: it would lose the hand.
  if (raise && view.mode.kind === 'normal' && wantsToRaise(view, chance, params, rng)) {
    return raise;
  }
  const plays = legal.filter((a): a is PlayCardAction => a.type === 'playCard');
  return choosePlay(view, plays, rng);
}

// --- How likely is the team to win this hand? ---------------------------------------------------

/**
 * 0..1: estimated chance that the bot's team wins the hand.
 *
 * Each card the team can still use gets its own chance of winning a round: beating the rival
 * card(s) of that round, drawn from the cards the bot hasn't seen (so cards already played are
 * counted). Treating those chances as independent, this is the chance of winning at least the
 * rounds still needed. A rival signal the bot caught lowers it, and so does every
 * truco/raise a rival made in this hand. 0.5 in mão de ferro (the bot can't see its cards).
 */
export function winChance(view: PlayerView): number {
  if (view.mode.kind === 'iron') {
    return 0.5;
  }
  const needed = roundsNeeded(view.completedRounds, view.team);
  const chance = chanceOfAtLeast(needed, teamCardChances(view));
  return clamp(chance - rivalSignalPenalty(view) - rivalBetPenalty(view), 0, 1);
}

/** Every truco/raise a rival made in this hand. */
function rivalBetPenalty(view: PlayerView): number {
  const rivalRaises = view.raisedBy.filter((seat) => teamOf(seat) !== view.team).length;
  return BET_RESPECT * rivalRaises;
}

/**
 * Chance that a card wins a round: it must beat each rival card played in that round
 * (one rival in 1x1, two in 2x2), each one a random card the bot hasn't seen.
 */
function cardWinChance(view: PlayerView, card: Card, rivalsToBeat = view.playerCount / 2): number {
  return chanceBeatsHiddenCard(view, card) ** rivalsToBeat;
}

/** One chance per card the team can still use: own cards, a card on the table, the partner's cards. */
function teamCardChances(view: PlayerView): number[] {
  const chances = view.ownCards.map((card) => cardWinChance(view, card));

  // A card the team already put on the table in this round: it only has to beat
  // the rivals who haven't played yet (and must already beat the ones who did).
  const teamOnTable = bestPlay(view.currentPlays.filter((p) => teamOf(p.seat) === view.team));
  if (teamOnTable) {
    const rivalPlays = view.currentPlays.filter((p) => teamOf(p.seat) !== view.team);
    const rivalOnTable = bestPlay(rivalPlays);
    const alreadyBeaten = rivalOnTable !== null && cardStrength(rivalOnTable.card) >= cardStrength(teamOnTable.card);
    const rivalsStillToPlay = view.playerCount / 2 - rivalPlays.length;
    chances.push(alreadyBeaten ? 0 : cardWinChance(view, teamOnTable.card, rivalsStillToPlay));
  }

  // 2x2: the partner's cards still in hand. The one they signaled, and the rest at an average chance.
  if (view.playerCount === 4) {
    const partner = (view.seat + 2) % 4;
    let unknown = cardsLeft(view, partner);
    for (const signaled of remainingAnnouncedCards(view, partner)) {
      if (unknown > 0) {
        chances.push(cardWinChance(view, signaled));
        unknown--;
      }
    }
    const average = averageUnseenWinChance(view);
    for (let i = 0; i < unknown; i++) {
      chances.push(average);
    }
  }
  return chances;
}


/** Win chance of a random card the bot hasn't seen (stands in for a partner card it doesn't know). */
function averageUnseenWinChance(view: PlayerView): number {
  const unseen = unseenCards(view);
  if (unseen.length === 0) {
    return 0;
  }
  return unseen.reduce((sum, card) => sum + cardWinChance(view, card), 0) / unseen.length;
}

/**
 * Chance of at least `k` successes among independent events with these chances.
 * Built one event at a time: dist[j] = chance of exactly j successes so far.
 */
function chanceOfAtLeast(k: number, chances: readonly number[]): number {
  let dist = [1];
  for (const p of chances) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, j) => {
      next[j] += q * (1 - p);
      next[j + 1] += q * p;
    });
    dist = next;
  }
  return dist.slice(k).reduce((sum, q) => sum + q, 0);
}

/** A caught rival signal of strong cards still in their hand: the team is weaker. */
function rivalSignalPenalty(view: PlayerView): number {
  let penalty = 0;
  for (const known of view.knownSignals) {
    if (teamOf(known.seat) === view.team) {
      continue;
    }
    for (const card of remainingAnnouncedCards(view, known.seat)) {
      penalty += RIVAL_SIGNAL_WEIGHT * (cardStrength(card) / MAX_CARD_STRENGTH);
    }
  }
  return penalty;
}

// --- "Faz a primeira?" ----------------------------------------------------------------------------

/**
 * Chance that the bot's best card takes the first round: it must beat the rival cards already
 * on the table (or it's 0) and the rivals still to play (random cards it hasn't seen).
 */
function firstRoundChance(view: PlayerView): number {
  const best = view.ownCards.reduce<Card | null>(
    (top, card) => (!top || cardStrength(card) > cardStrength(top) ? card : top),
    null,
  );
  if (!best) {
    return 0;
  }
  const rivalPlays = view.currentPlays.filter((p) => teamOf(p.seat) !== view.team);
  if (rivalPlays.some((p) => cardStrength(p.card) >= cardStrength(best))) {
    return 0;
  }
  return cardWinChance(view, best, view.playerCount / 2 - rivalPlays.length);
}

function honestFirstRoundAnswer(view: PlayerView): FirstRoundAnswer {
  const chance = firstRoundChance(view);
  if (chance >= ANSWER_YES_FROM) {
    return 'yes';
  }
  return chance >= ANSWER_MAYBE_FROM ? 'maybe' : 'no';
}

/** What the partner answered when this bot asked "faz a primeira?" in this hand, if it did. */
function partnerFirstRoundAnswer(view: PlayerView): FirstRoundAnswer | null {
  return view.talk.find((talk) => talk.askerSeat === view.seat)?.answer ?? null;
}

// --- Betting -------------------------------------------------------------------------------------

/**
 * Chance of winning the MATCH from a score, if every hand were a coin flip worth 1 point
 * ("gambler's ruin"): the points the rival still needs, over the points both still need.
 * 0×0 → 50%. 11×0 (to 12) → 12/13 ≈ 92%. Reaching the target → 100% (or 0% for the rival).
 */
export function matchWinChance(mine: number, theirs: number, target: number): number {
  if (mine >= target) {
    return 1;
  }
  if (theirs >= target) {
    return 0;
  }
  const myGap = target - mine;
  const theirGap = target - theirs;
  return theirGap / (myGap + theirGap);
}

/** Aggressiveness shifts every threshold: 0.5 is neutral, higher bets on weaker hands. */
function aggressionShift(params: BotParams): number {
  return 0.2 * (params.aggressiveness - 0.5);
}

/**
 * Is accepting a bet worth more than running, in chance of winning the MATCH?
 *   accept: P × W(me + requested, them) + (1 − P) × W(me, them + requested)
 *   run:    W(me, them + current)
 * Early in a match W is almost a straight line and this is the classic pot-odds rule
 * (accept a truco from P = 1/3). Near the end it changes by itself: if running hands the
 * rivals the match, any chance is worth accepting.
 * Also used for the mão de 11 choice (requested 3, current 1).
 */
export function acceptIsWorthIt(
  view: PlayerView,
  chance: number,
  params: BotParams,
  requested: number,
  current: number,
): boolean {
  const p = clamp(chance - SAFETY_MARGIN + aggressionShift(params), 0, 1);
  const mine = view.scores[view.team];
  const theirs = view.scores[view.team === 0 ? 1 : 0];
  const target = view.targetScore;
  const ifAccept =
    p * matchWinChance(mine + requested, theirs, target) + (1 - p) * matchWinChance(mine, theirs + requested, target);
  const ifRun = matchWinChance(mine, theirs + current, target);
  return ifAccept >= ifRun;
}

/** Ask for more when clearly favored to win the hand. */
function raiseThreshold(params: BotParams): number {
  return 0.6 + SAFETY_MARGIN - aggressionShift(params);
}

function wantsToRaise(view: PlayerView, chance: number, params: BotParams, rng: Rng): boolean {
  // "Deixa comigo": betting is the partner's call.
  if (partnerSaidLeaveItToMe(view)) {
    return false;
  }
  if (chance >= raiseThreshold(params)) {
    return true;
  }
  return bluffIsReasonable(view) && rng() < params.bluffChance;
}

/**
 * A bluff is worth a try only once per hand (the bot hasn't asked for anything yet)
 * and only when the rivals are unlikely to hold a manilha to call it with.
 */
function bluffIsReasonable(view: PlayerView): boolean {
  const alreadyRaised = view.raisedBy.some((seat) => teamOf(seat) === view.team);
  return !alreadyRaised && chanceRivalsHaveManilha(view) <= BLUFF_MAX_RIVAL_MANILHA_CHANCE;
}

function answer(
  view: PlayerView,
  chance: number,
  params: BotParams,
  rng: Rng,
  accept: AcceptAction,
  run: RunAction,
  raise: RaiseAction | undefined,
): HandAction {
  // Mão de 11: playing makes it worth 3, running gives away 1.
  if (view.elevenDeciderSeat === view.seat) {
    return acceptIsWorthIt(view, chance, params, 3, 1) ? accept : run;
  }

  // "Deixa comigo": trust the partner, never run, and leave raising to them.
  if (partnerSaidLeaveItToMe(view)) {
    return accept;
  }
  const requested = view.pendingBet?.requested ?? 3;
  if (raise && chance >= raiseThreshold(params) + 0.1) {
    return raise;
  }
  // Partner announced zap or copas: never run from a plain truco. That card is a round in
  // the bag, and running would waste it. (Arena: no cost; it was a real complaint in play.)
  if (requested === 3 && partnerShowedTopManilha(view)) {
    return accept;
  }
  // When accepting doesn't pay off, running is right: no "calling bluffs".
  return acceptIsWorthIt(view, chance, params, requested, view.stake) ? accept : run;
}

/** 2x2: the partner signaled zap or copas, and hasn't played it yet. */
function partnerShowedTopManilha(view: PlayerView): boolean {
  if (view.playerCount !== 4) {
    return false;
  }
  const partner = (view.seat + 2) % 4;
  const signal = view.knownSignals.find((s) => s.seat === partner)?.signal;
  return (signal === 'zap' || signal === 'copas') && remainingAnnouncedCards(view, partner).length > 0;
}

// --- Playing cards -------------------------------------------------------------------------------

function choosePlay(view: PlayerView, plays: readonly PlayCardAction[], rng: Rng): PlayCardAction {
  // Mão de ferro: the bot can't see its cards, so any card is a guess.
  if (view.mode.kind === 'iron') {
    return plays[Math.floor(rng() * plays.length)];
  }
  const weakestFirst = [...plays].sort((a, b) => cardStrength(a.card) - cardStrength(b.card));

  // "Deixa comigo": the partner will win it; just throw the smallest card.
  if (partnerSaidLeaveItToMe(view)) {
    return weakestFirst[0];
  }
  return view.currentPlays.length === 0 ? lead(view, weakestFirst) : follow(view, weakestFirst);
}

/** Opening a round. */
function lead(view: PlayerView, weakestFirst: readonly PlayCardAction[]): PlayCardAction {
  const strongest = weakestFirst[weakestFirst.length - 1];

  // First round: a middle card, keeping the best one for when it decides.
  // (Arena: changing the opening card after "faço"/"não faço" made the bot worse in 2x2.)
  if (view.completedRounds.length === 0) {
    return weakestFirst[Math.floor((weakestFirst.length - 1) / 2)];
  }
  // Later rounds: open strong. (Arena: opening weak after winning the first round, "to make
  // the rivals spend", lost ~5 points in 1x1 to 24.)
  return strongest;
}

/** Answering a round someone else opened. The engine says what each card would do. */
function follow(view: PlayerView, weakestFirst: readonly PlayCardAction[]): PlayCardAction {
  const weakest = weakestFirst[0];
  const best = bestPlay(view.currentPlays)!;
  const outcome = (card: Card) => roundWinner([...view.currentPlays, { seat: view.seat, card }]);

  // Partner already winning the round. (Arena: also holding back when the partner, still to
  // play, had announced a covering card cost ~4 points in 2x2; announced cards aren't certain.)
  if (teamOf(best.seat) === view.team) {
    return weakest;
  }
  // First round, partner still to play and said "faço": let them take it.
  const partnerStillToPlay = view.playerCount === 4 && !view.currentPlays.some((p) => p.seat === (view.seat + 2) % 4);
  if (view.completedRounds.length === 0 && partnerStillToPlay && partnerFirstRoundAnswer(view) === 'yes') {
    return weakest;
  }
  // Cheapest card that wins the round.
  const winner = weakestFirst.find((play) => outcome(play.card) === view.team);
  if (winner) {
    return winner;
  }
  // Can't win: a tie (cangou) still helps, unless the first round was lost (then a tie loses too).
  const tie = weakestFirst.find((play) => outcome(play.card) === 'tie');
  if (tie && tieHelps(view)) {
    return tie;
  }
  return weakest;
}

/** A tie is as bad as a loss only after losing the first round (the rivals then take the hand). */
function tieHelps(view: PlayerView): boolean {
  const first = view.completedRounds[0]?.result;
  return first === undefined || first === 'tie' || first === view.team;
}

// --- Helpers -------------------------------------------------------------------------------------

function bestPlay(plays: readonly Play[]): Play | null {
  return plays.reduce<Play | null>((best, p) => (!best || cardStrength(p.card) > cardStrength(best.card) ? p : best), null);
}

function allPlays(view: PlayerView): Play[] {
  return [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays];
}

/** 3 minus the cards this seat already put on the table. */
function cardsLeft(view: PlayerView, seat: number): number {
  return CARDS_PER_HAND - allPlays(view).filter((p) => p.seat === seat).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
