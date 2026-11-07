// Exact odds from what a player can see. Used by the bot and by the feedback.
// Pure TypeScript: no Angular imports allowed in src/app/engine.
//
// Idea: every card the player hasn't seen is equally likely to be anywhere it could be.
// The rivals' remaining cards are a random handful taken from the unseen pile
// (the rest of that pile is the partner's hand and the cards nobody got).

import { Card, cardStrength, CARDS_PER_HAND, createDeck, isManilha, isSameCard } from './card';
import { teamOf } from './hand';
import { PlayerView } from './view';

/** Cards the player hasn't seen: the deck minus their own cards and every card already played. */
export function unseenCards(view: PlayerView): Card[] {
  const seen = [...view.ownCards, ...playedCards(view)];
  return createDeck().filter((card) => !seen.some((s) => isSameCard(s, card)));
}

/** How many cards the rivals still hold, all together. */
export function rivalCardCount(view: PlayerView): number {
  let count = 0;
  for (let seat = 0; seat < view.playerCount; seat++) {
    if (teamOf(seat) !== view.team) {
      count += cardsLeft(view, seat);
    }
  }
  return count;
}

/**
 * Chance that the rivals, between them, hold at least one card matching `isDanger`.
 *
 * With N unseen cards, m of them dangerous, and the rivals holding k of the N:
 *   P(no danger) = C(N-m, k) / C(N, k)  =  product over i < k of (N-m-i) / (N-i)
 * and the answer is 1 - P(no danger).
 */
export function chanceRivalsHoldAny(view: PlayerView, isDanger: (card: Card) => boolean): number {
  const unseen = unseenCards(view);
  const total = unseen.length;
  const dangerous = unseen.filter(isDanger).length;
  const held = rivalCardCount(view);

  let noDanger = 1;
  for (let i = 0; i < held; i++) {
    noDanger *= (total - dangerous - i) / (total - i);
  }
  return 1 - noDanger;
}

/** Chance that some rival holds a card that beats `card` (a tie doesn't count as beating). */
export function chanceRivalsBeat(view: PlayerView, card: Card): number {
  const strength = cardStrength(card);
  return chanceRivalsHoldAny(view, (other) => cardStrength(other) > strength);
}

/**
 * Chance that `card` beats ONE hidden card picked at random from the unseen pile.
 * A tie (cangou) counts as half: it's neither a win nor a loss.
 * This is the chance of winning a round against a single card, which is how rounds work.
 */
export function chanceBeatsHiddenCard(view: PlayerView, card: Card): number {
  const unseen = unseenCards(view);
  if (unseen.length === 0) {
    return 1;
  }
  const strength = cardStrength(card);
  const weaker = unseen.filter((other) => cardStrength(other) < strength).length;
  const ties = unseen.filter((other) => cardStrength(other) === strength).length;
  return (weaker + ties / 2) / unseen.length;
}

/** Chance that some rival holds at least one manilha. */
export function chanceRivalsHaveManilha(view: PlayerView): number {
  return chanceRivalsHoldAny(view, isManilha);
}

function playedCards(view: PlayerView): Card[] {
  return [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays].map(
    (play) => play.card,
  );
}

/** 3 minus the cards this seat already put on the table. */
function cardsLeft(view: PlayerView, seat: number): number {
  const plays = [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays];
  return CARDS_PER_HAND - plays.filter((play) => play.seat === seat).length;
}
