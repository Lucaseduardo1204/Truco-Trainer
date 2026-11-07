// Pure TypeScript: no Angular imports allowed in src/app/engine.

import { Card, cardStrength, isManilha, isSameCard } from './card';

/**
 * Classic truco mineiro signals. Most announce "my best card is...";
 * 'leaveItToMe' ("deixa comigo") announces two strong cards: "I can win this alone".
 */
export type Signal = 'zap' | 'copas' | 'espadao' | 'picaFumo' | 'tres' | 'nothing' | 'leaveItToMe';

export const SIGNALS: readonly Signal[] = ['zap', 'copas', 'espadao', 'picaFumo', 'tres', 'leaveItToMe', 'nothing'];

/** The exact card announced by each manilha signal. */
const MANILHA_SIGNALS: readonly { signal: Signal; card: Card }[] = [
  { signal: 'zap', card: { rank: '4', suit: 'clubs' } },
  { signal: 'copas', card: { rank: '7', suit: 'hearts' } },
  { signal: 'espadao', card: { rank: 'A', suit: 'spades' } },
  { signal: 'picaFumo', card: { rank: '7', suit: 'diamonds' } },
];

/** A strong card, as counted by "deixa comigo": a manilha or a 3. */
function isStrongCard(card: Card): boolean {
  return isManilha(card) || card.rank === '3';
}

/**
 * The honest signal for a hand:
 * 'leaveItToMe' with 2+ strong cards (manilha or 3) including a manilha;
 * otherwise its best manilha, else 'tres' if it has a 3, else 'nothing'.
 */
export function truthfulSignal(cards: readonly Card[]): Signal {
  if (cards.filter(isStrongCard).length >= 2 && cards.some(isManilha)) {
    return 'leaveItToMe';
  }
  for (const { signal, card } of MANILHA_SIGNALS) {
    if (cards.some((c) => isSameCard(c, card))) {
      return signal;
    }
  }
  return cards.some((c) => c.rank === '3') ? 'tres' : 'nothing';
}

/**
 * True if playing `card` uses up (part of) what `signal` announced:
 * the exact manilha, any 3 for 'tres', any manilha or 3 for 'leaveItToMe'.
 */
export function signalMatchesCard(signal: Signal, card: Card): boolean {
  if (signal === 'tres') {
    return card.rank === '3';
  }
  if (signal === 'leaveItToMe') {
    return isStrongCard(card);
  }
  const manilha = MANILHA_SIGNALS.find((entry) => entry.signal === signal);
  return manilha !== undefined && isSameCard(manilha.card, card);
}

/**
 * The cards a signal announces, as stand-ins for reasoning about them:
 * one manilha, any 3 (as 3♣), nothing, or for 'leaveItToMe' the weakest pair it promises
 * (pica-fumo 7♦ + a 3), so nobody over-trusts it.
 */
export function announcedCards(signal: Signal): Card[] {
  switch (signal) {
    case 'nothing':
      return [];
    case 'tres':
      return [{ rank: '3', suit: 'clubs' }];
    case 'leaveItToMe':
      return [
        { rank: '7', suit: 'diamonds' },
        { rank: '3', suit: 'clubs' },
      ];
    default:
      return [MANILHA_SIGNALS.find((entry) => entry.signal === signal)!.card];
  }
}

/** Strength (as in cardStrength) of the best card a signal announces; -1 for 'nothing'. */
export function signalStrength(signal: Signal): number {
  const cards = announcedCards(signal);
  return cards.length === 0 ? -1 : Math.max(...cards.map(cardStrength));
}
