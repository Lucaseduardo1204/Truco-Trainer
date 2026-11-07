// Pure TypeScript: no Angular imports allowed in src/app/engine.

export type Suit = 'clubs' | 'hearts' | 'spades' | 'diamonds';

// Clean deck ("baralho limpo"): no 5, 6, 8, 9 or 10. 4 and 7 only exist as manilhas.
export type Rank = '4' | '7' | 'Q' | 'J' | 'K' | 'A' | '2' | '3';

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export const SUITS: readonly Suit[] = ['clubs', 'hearts', 'spades', 'diamonds'];

// Ranks of the common (non-manilha) cards, weakest to strongest.
export const COMMON_RANKS: readonly Rank[] = ['Q', 'J', 'K', 'A', '2', '3'];

// Fixed manilhas, strongest first: zap 4♣ > copas 7♥ > espadão A♠ > pica-fumo 7♦.
const MANILHAS: readonly Card[] = [
  { rank: '4', suit: 'clubs' },
  { rank: '7', suit: 'hearts' },
  { rank: 'A', suit: 'spades' },
  { rank: '7', suit: 'diamonds' },
];

/** Strength of the zap, the strongest card (see cardStrength). */
export const MAX_CARD_STRENGTH = COMMON_RANKS.length + MANILHAS.length - 1;

/** 27 cards: Q, J, K, A, 2, 3 of every suit, plus the manilhas 4♣, 7♥ and 7♦. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of COMMON_RANKS) {
      deck.push({ rank, suit });
    }
  }
  // A♠ is already in (it's an ace); add the manilhas that aren't.
  for (const manilha of MANILHAS) {
    if (!deck.some((card) => isSameCard(card, manilha))) {
      deck.push(manilha);
    }
  }
  return deck;
}

export const CARDS_PER_HAND = 3;

export type PlayerCount = 2 | 4;

/**
 * Deals 3 cards to each player from the top of the deck.
 * Returns one hand per player, in seat order. The deck is not changed.
 */
export function dealHands(deck: readonly Card[], playerCount: PlayerCount): Card[][] {
  const hands: Card[][] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    const start = seat * CARDS_PER_HAND;
    hands.push(deck.slice(start, start + CARDS_PER_HAND));
  }
  return hands;
}

export function isSameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

export function isManilha(card: Card): boolean {
  return MANILHAS.some((manilha) => isSameCard(manilha, card));
}

/**
 * Higher number = stronger card.
 * Common cards score 0..5 (their position in COMMON_RANKS); suit doesn't matter.
 * Manilhas score above every common card: 7♦ = 6, A♠ = 7, 7♥ = 8, 4♣ = 9.
 */
export function cardStrength(card: Card): number {
  const manilhaIndex = MANILHAS.findIndex((manilha) => isSameCard(manilha, card));
  if (manilhaIndex !== -1) {
    return COMMON_RANKS.length + (MANILHAS.length - 1 - manilhaIndex);
  }
  return COMMON_RANKS.indexOf(card.rank);
}

/**
 * Positive if `a` wins, negative if `b` wins, 0 if they tie ("cangou").
 */
export function compareCards(a: Card, b: Card): number {
  return cardStrength(a) - cardStrength(b);
}
