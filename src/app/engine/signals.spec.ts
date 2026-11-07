import { announcedCards, signalMatchesCard, signalStrength, truthfulSignal } from './signals';
import { c } from './testing';

describe('truthfulSignal', () => {
  it('announces the best manilha', () => {
    // One manilha only (two strong cards would be "deixa comigo").
    expect(truthfulSignal(['K♥', '4♣', 'K♣'].map(c))).toBe('zap');
    expect(truthfulSignal(['2♥', 'A♠', 'J♣'].map(c))).toBe('espadao');
  });

  it('announces a three when there is no manilha', () => {
    expect(truthfulSignal(['3♥', 'K♣', 'Q♦'].map(c))).toBe('tres');
  });

  it('says "nothing" otherwise', () => {
    expect(truthfulSignal(['2♥', 'K♣', 'Q♦'].map(c))).toBe('nothing');
  });
});

describe('signalMatchesCard', () => {
  it('matches the exact manilha, or any three', () => {
    expect(signalMatchesCard('copas', c('7♥'))).toBe(true);
    expect(signalMatchesCard('copas', c('7♦'))).toBe(false);
    expect(signalMatchesCard('tres', c('3♠'))).toBe(true);
    expect(signalMatchesCard('nothing', c('3♠'))).toBe(false);
  });
});

describe('signalStrength', () => {
  it('follows the card order', () => {
    expect(signalStrength('zap')).toBeGreaterThan(signalStrength('copas'));
    expect(signalStrength('picaFumo')).toBeGreaterThan(signalStrength('tres'));
    expect(signalStrength('nothing')).toBe(-1);
  });
});

describe('deixa comigo (leaveItToMe)', () => {
  it('is the honest signal with two strong cards including a manilha', () => {
    expect(truthfulSignal(['4♣', '7♥', 'K♣'].map(c))).toBe('leaveItToMe');
    expect(truthfulSignal(['A♠', '3♥', 'K♣'].map(c))).toBe('leaveItToMe');
  });

  it('two threes without a manilha is still just "tres"; one manilha alone is the manilha', () => {
    expect(truthfulSignal(['3♣', '3♥', 'K♣'].map(c))).toBe('tres');
    expect(truthfulSignal(['4♣', 'K♥', 'Q♣'].map(c))).toBe('zap');
  });

  it('is used up by any manilha or 3, and announces a cautious pair', () => {
    expect(signalMatchesCard('leaveItToMe', c('3♦'))).toBe(true);
    expect(signalMatchesCard('leaveItToMe', c('7♥'))).toBe(true);
    expect(signalMatchesCard('leaveItToMe', c('2♦'))).toBe(false);
    expect(announcedCards('leaveItToMe')).toEqual([c('7♦'), c('3♣')]);
  });
});
