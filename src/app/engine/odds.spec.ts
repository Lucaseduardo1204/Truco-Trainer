import { cardStrength } from './card';
import { applyAction, createHand } from './hand';
import { createMatch, MatchState } from './match';
import { createRng, shuffle } from './random';
import { c } from './testing';
import { getPlayerView } from './view';
import {
  chanceBeatsHiddenCard,
  chanceRivalsBeat,
  chanceRivalsHaveManilha,
  chanceRivalsHoldAny,
  rivalCardCount,
  unseenCards,
} from './odds';

/** A match whose current hand has the given cards (seat 0 leads). */
function matchWith(hands: string[][]): MatchState {
  const playerCount = hands.length === 4 ? 4 : 2;
  const base = createMatch({ playerCount, targetScore: 12, seed: 1 });
  return { ...base, hand: createHand(playerCount, hands.map((h) => h.map(c)), 0) };
}

const NO_MANILHA = ['K♣', 'J♥', 'Q♦'];

describe('unseenCards / rivalCardCount', () => {
  it('1x1 at the start: 27 - my 3 = 24 unseen; the rival holds 3', () => {
    const view = getPlayerView(matchWith([NO_MANILHA, ['3♣', '2♣', 'A♣']]), 0);
    expect(unseenCards(view)).toHaveLength(24);
    expect(rivalCardCount(view)).toBe(3);
  });

  it('played cards become seen, and the rival holds one fewer', () => {
    const match = matchWith([NO_MANILHA, ['3♣', '2♣', 'A♣']]);
    const hand = applyAction(applyAction(match.hand, { type: 'playCard', seat: 0, card: c('K♣') }), {
      type: 'playCard',
      seat: 1,
      card: c('3♣'),
    });
    const view = getPlayerView({ ...match, hand }, 0);
    // Seen: 2 still in hand + my K♣ + the rival's 3♣ = 4, so 27 - 4 = 23.
    expect(unseenCards(view)).toHaveLength(23);
    expect(rivalCardCount(view)).toBe(2);
  });

  it('2x2: two rivals hold 6 cards between them', () => {
    const view = getPlayerView(matchWith([NO_MANILHA, ['3♣', '2♣', 'A♣'], ['3♥', '2♥', 'A♥'], ['3♦', '2♦', 'A♦']]), 0);
    expect(rivalCardCount(view)).toBe(6);
  });
});

describe('exact odds', () => {
  const view = getPlayerView(matchWith([NO_MANILHA, ['3♣', '2♣', 'A♣']]), 0);

  it('chanceBeatsHiddenCard: an ace beats 12 of 24 unseen cards and ties 2 (counted as half)', () => {
    const holding = getPlayerView(matchWith([['A♣', '2♥', '3♥'], ['4♣', '7♥', '3♣']]), 0);
    expect(chanceBeatsHiddenCard(holding, c('A♣'))).toBeCloseTo(13 / 24, 10);
    // From the zap holder's seat, nothing hidden can match the zap.
    const zapHolder = getPlayerView(matchWith([['A♣', '2♥', '3♥'], ['4♣', '7♥', '3♣']]), 1);
    expect(chanceBeatsHiddenCard(zapHolder, c('4♣'))).toBe(1);
  });

  it('impossible and certain dangers', () => {
    expect(chanceRivalsHoldAny(view, () => false)).toBe(0);
    expect(chanceRivalsHoldAny(view, () => true)).toBe(1);
  });

  it('chance a single rival has a manilha: 1 - C(20,3)/C(24,3)', () => {
    expect(chanceRivalsHaveManilha(view)).toBeCloseTo(1 - 1140 / 2024, 10);
  });

  it('nobody can beat the zap', () => {
    const withZap = getPlayerView(matchWith([['4♣', 'K♣', 'Q♣'], ['3♣', '2♣', 'A♣']]), 0);
    expect(chanceRivalsBeat(withZap, c('4♣'))).toBe(0);
  });

  it('two rivals (2x2) are more likely to have a manilha than one', () => {
    const twoVsTwo = getPlayerView(
      matchWith([NO_MANILHA, ['3♣', '2♣', 'A♣'], ['3♥', '2♥', 'A♥'], ['3♦', '2♦', 'A♦']]),
      0,
    );
    expect(chanceRivalsHaveManilha(twoVsTwo)).toBeGreaterThan(chanceRivalsHaveManilha(view));
  });

  it('matches a simulation (deal the unseen cards at random many times)', () => {
    const unseen = unseenCards(view);
    const rng = createRng(123);
    const trials = 20_000;
    let beaten = 0;
    for (let t = 0; t < trials; t++) {
      const rivalHand = shuffle(unseen, rng).slice(0, 3);
      if (rivalHand.some((card) => cardStrength(card) > cardStrength(c('K♣')))) {
        beaten++;
      }
    }
    expect(beaten / trials).toBeCloseTo(chanceRivalsBeat(view, c('K♣')), 2);
  });
});
