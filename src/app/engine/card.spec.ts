import { Card, compareCards, createDeck, dealHands, isManilha, isSameCard } from './card';
import { createRng, shuffle } from './random';

const card = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });

describe('createDeck', () => {
  it('has 27 cards', () => {
    expect(createDeck()).toHaveLength(27);
  });

  it('has no duplicate cards', () => {
    const keys = createDeck().map((c) => `${c.rank}-${c.suit}`);
    expect(new Set(keys).size).toBe(27);
  });

  it('has exactly 4 manilhas', () => {
    expect(createDeck().filter(isManilha)).toHaveLength(4);
  });

  it('has 4s and 7s only as manilhas', () => {
    const foursAndSevens = createDeck().filter((c) => c.rank === '4' || c.rank === '7');
    expect(foursAndSevens).toHaveLength(3);
    foursAndSevens.forEach((c) => expect(isManilha(c)).toBe(true));
  });
});

describe('compareCards', () => {
  it('orders manilhas: zap > copas > espadão > pica-fumo', () => {
    const zap = card('4', 'clubs');
    const copas = card('7', 'hearts');
    const espadao = card('A', 'spades');
    const picaFumo = card('7', 'diamonds');

    expect(compareCards(zap, copas)).toBeGreaterThan(0);
    expect(compareCards(copas, espadao)).toBeGreaterThan(0);
    expect(compareCards(espadao, picaFumo)).toBeGreaterThan(0);
  });

  it('weakest manilha beats the strongest common card', () => {
    expect(compareCards(card('7', 'diamonds'), card('3', 'hearts'))).toBeGreaterThan(0);
  });

  it('orders common cards: 3 > 2 > A > K > J > Q', () => {
    const order = ['3', '2', 'A', 'K', 'J', 'Q'] as const;
    // Clubs: the only club manilha is the 4, which isn't in this list.
    for (let i = 0; i < order.length - 1; i++) {
      const stronger = card(order[i], 'clubs');
      const weaker = card(order[i + 1], 'clubs');
      expect(compareCards(stronger, weaker)).toBeGreaterThan(0);
    }
  });

  it('common cards of the same rank tie (cangou)', () => {
    expect(compareCards(card('3', 'clubs'), card('3', 'diamonds'))).toBe(0);
  });
});

describe('dealHands', () => {
  const deck = shuffle(createDeck(), createRng(11));

  it('gives 3 cards to each of 2 players', () => {
    const hands = dealHands(deck, 2);
    expect(hands).toHaveLength(2);
    hands.forEach((hand) => expect(hand).toHaveLength(3));
  });

  it('gives 3 cards to each of 4 players', () => {
    const hands = dealHands(deck, 4);
    expect(hands).toHaveLength(4);
    hands.forEach((hand) => expect(hand).toHaveLength(3));
  });

  it('never deals the same card twice', () => {
    const dealt = dealHands(deck, 4).flat();
    const unique = dealt.filter((c, i) => dealt.findIndex((other) => isSameCard(c, other)) === i);
    expect(unique).toHaveLength(12);
  });

  it('does not change the deck', () => {
    const before = [...deck];
    dealHands(deck, 4);
    expect(deck).toEqual(before);
  });
});
