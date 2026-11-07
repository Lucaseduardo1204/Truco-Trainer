import { c } from '../engine/testing';
import { buildScenario, Scenario } from './scenario';
import { simulateOptions } from './simulate';

const base: Scenario = {
  playerCount: 2,
  targetScore: 12,
  scores: [0, 0],
  myCards: ['3♣', 'K♣', 'Q♣'].map(c),
  tableCards: [],
  betAsked: null,
};

describe('buildScenario', () => {
  it('opening the first round in 1x1: you play first, with your 3 cards (and may ask for truco)', () => {
    const result = buildScenario(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.view.ownCards).toEqual(base.myCards);
    expect(result.view.leadSeat).toBe(0);
    expect(result.legal.map((a) => a.type).sort()).toEqual(['playCard', 'playCard', 'playCard', 'raise']);
  });

  it('2x2, third to play: the two cards on the table came from the two seats before you', () => {
    const result = buildScenario({ ...base, playerCount: 4, tableCards: ['2♥', 'A♦'].map(c) });
    if (!result.ok) throw new Error(result.error);
    expect(result.view.currentPlays.map((p) => p.seat)).toEqual([2, 3]);
    expect(result.view.leadSeat).toBe(2);
  });

  it('a rival asking for truco (before playing their card): you answer (accept, run, or seis)', () => {
    const result = buildScenario({ ...base, betAsked: 3 });
    if (!result.ok) throw new Error(result.error);
    expect(result.view.pendingBet).toEqual({ requested: 3, callerSeat: 1, responderSeat: 0 });
    expect(result.view.raisedBy).toEqual([1]);
    expect(result.view.currentPlays).toEqual([]); // the rival asks before playing
    expect(result.legal.map((a) => a.type)).toEqual(['accept', 'run', 'raise']);
  });

  it('a seis asked means the hand was worth 3 so far', () => {
    const result = buildScenario({ ...base, betAsked: 6 });
    if (!result.ok) throw new Error(result.error);
    expect(result.view.stake).toBe(3);
  });

  it('the score decides the hand type: 11 x 5 (to 12) is a mão de 11 for you', () => {
    const result = buildScenario({ ...base, scores: [11, 5] });
    if (!result.ok) throw new Error(result.error);
    expect(result.view.mode).toEqual({ kind: 'eleven', team: 0 });
    expect(result.legal.map((a) => a.type)).toEqual(['accept', 'run']);
  });

  it('can be simulated right away', () => {
    const result = buildScenario(base);
    if (!result.ok) throw new Error(result.error);
    expect(simulateOptions(result.view, result.legal, 30, 1).options.length).toBe(4);
  });

  describe('explains what is wrong', () => {
    const errorOf = (s: Scenario) => {
      const result = buildScenario(s);
      return result.ok ? null : result.error;
    };

    it('needs exactly 3 cards', () => {
      expect(errorOf({ ...base, myCards: ['3♣'].map(c) })).toBe('Escolha as suas 3 cartas.');
    });

    it('no card twice', () => {
      expect(errorOf({ ...base, tableCards: ['3♣'].map(c) })).toBe('A mesma carta aparece duas vezes.');
    });

    it('no more table cards than players before you', () => {
      expect(errorOf({ ...base, tableCards: ['2♥', 'A♦'].map(c) })).toBe('Cartas demais na mesa para esse formato.');
    });

    it('the rival asking for truco has not played yet', () => {
      expect(errorOf({ ...base, tableCards: ['2♥'].map(c), betAsked: 3 })).toBe(
        'Quem pede truco ainda não jogou: tire uma carta da mesa.',
      );
    });

    it('score within the target', () => {
      expect(errorOf({ ...base, scores: [12, 0] })).toBe('O placar vai de 0 a 11.');
    });

    it('no truco in a mão de 11', () => {
      expect(errorOf({ ...base, scores: [11, 0], betAsked: 3 })).toBe(
        'Na mão de 11 e na mão de ferro não tem truco.',
      );
    });

    it('the rivals\' mão de 11 before any card: they decide first', () => {
      expect(errorOf({ ...base, scores: [0, 11] })).toBe('Nessa situação ainda não é a sua vez de decidir.');
    });
  });
});
