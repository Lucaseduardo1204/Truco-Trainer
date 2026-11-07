import { applyAction, createHand, getLegalActions, HandAction, HandMode, HandState, roundsNeeded } from '../engine/hand';
import { createMatch, MatchState } from '../engine/match';
import { c } from '../engine/testing';
import { getPlayerView } from '../engine/view';
import { DecisionPoint } from './decisions';
import { detectFindings, FindingKind } from './detectors';

const RIVAL = ['3♥', '2♥', 'J♥'];

/** 1x1 match with these hands; `lead` opens the hand. Optional actions applied first. */
function setup(mine: string[], rival: string[], lead: number, actions: HandAction[] = [], mode?: HandMode): MatchState {
  const base = createMatch({ playerCount: 2, targetScore: 12, seed: 1 });
  const start = createHand(2, [mine.map(c), rival.map(c)], lead, mode);
  const hand = actions.reduce((h: HandState, a) => applyAction(h, a), start);
  return { ...base, hand };
}

/** The human (seat 0) taking `action` in `match`. */
function decide(match: MatchState, action: HandAction, nextAction: HandAction | null = null): DecisionPoint {
  return {
    historyIndex: 0,
    handNumber: 1,
    view: getPlayerView(match, 0),
    legal: getLegalActions(match.hand),
    action,
    nextAction,
    revealedHands: match.hand.hands,
  };
}

const kinds = (decision: DecisionPoint): FindingKind[] => detectFindings(decision).map((f) => f.kind);

const rivalAsksTruco: HandAction = { type: 'raise', seat: 1 };
const RUN: HandAction = { type: 'run', seat: 0 };
const ACCEPT: HandAction = { type: 'accept', seat: 0 };

describe('detector: ran from a strong hand', () => {
  it('flags running from truco holding zap and copas (2 unbeatable cards, 2 rounds needed)', () => {
    const match = setup(['4♣', '7♥', 'Q♣'], RIVAL, 1, [rivalAsksTruco]);
    expect(kinds(decide(match, RUN))).toEqual(['ranFromStrong']);
  });

  it('does not flag running with only one safe card and two rounds to go', () => {
    const match = setup(['4♣', 'K♣', 'Q♣'], RIVAL, 1, [rivalAsksTruco]);
    expect(kinds(decide(match, RUN))).toEqual([]);
  });

  it('does not flag running with a weak hand', () => {
    const match = setup(['Q♣', 'J♣', 'K♣'], RIVAL, 1, [rivalAsksTruco]);
    expect(kinds(decide(match, RUN))).toEqual([]);
  });

  it('explains it in player language', () => {
    const match = setup(['4♣', '7♥', 'Q♣'], RIVAL, 1, [rivalAsksTruco]);
    const [finding] = detectFindings(decide(match, RUN));
    expect(finding.did).toBe('Correu do truco');
    expect(finding.why).toContain('4♣ (zap)');
    expect(finding.why).toContain('ninguém podia bater');
  });
});

describe('detector: weak hand bets', () => {
  it('flags accepting truco with a weak hand as a mistake', () => {
    const match = setup(['Q♣', 'J♣', 'K♣'], RIVAL, 1, [rivalAsksTruco]);
    const [finding] = detectFindings(decide(match, ACCEPT));
    expect(finding.kind).toBe('acceptedWeak');
    expect(finding.severity).toBe('mistake');
  });

  it('does not flag accepting with a 3 that will probably hold (about 44% to be beaten)', () => {
    const match = setup(['3♠', 'Q♣', 'J♣'], RIVAL.map((card) => (card === '3♥' ? 'K♥' : card)), 1, [rivalAsksTruco]);
    expect(kinds(decide(match, ACCEPT))).toEqual([]);
  });

  it('does not flag accepting with zap and copas', () => {
    const match = setup(['4♣', '7♥', 'Q♣'], RIVAL, 1, [rivalAsksTruco]);
    expect(kinds(decide(match, ACCEPT))).toEqual([]);
  });

  it('asking for truco with a weak hand is a bluff, not a mistake', () => {
    const match = setup(['Q♣', 'J♣', 'K♣'], RIVAL, 0);
    const [finding] = detectFindings(decide(match, { type: 'raise', seat: 0 }));
    expect(finding.kind).toBe('bluff');
    expect(finding.severity).toBe('bluff');
  });

  it('playing a mão de 11 with a weak hand counts as accepting weak', () => {
    const match = setup(['Q♣', 'J♣', 'K♣'], RIVAL, 0, [], { kind: 'eleven', team: 0 });
    expect(detectFindings(decide(match, ACCEPT))[0].did).toBe('Jogou a mão de 11 com mão fraca');
  });
});

describe('detector: wasted manilha', () => {
  it('flags closing a round with the zap when an ace also wins', () => {
    const match = setup(['4♣', 'A♣', 'Q♣'], ['K♥', '2♥', 'J♥'], 1, [{ type: 'playCard', seat: 1, card: c('K♥') }]);
    const [finding] = detectFindings(decide(match, { type: 'playCard', seat: 0, card: c('4♣') }));
    expect(finding.kind).toBe('wastedManilha');
    expect(finding.better).toBe('Jogar A♣');
  });

  it('flags spending a manilha on a round nothing could win', () => {
    const match = setup(['7♦', 'Q♣', 'J♣'], ['7♥', '2♥', 'J♥'], 1, [{ type: 'playCard', seat: 1, card: c('7♥') }]);
    const [finding] = detectFindings(decide(match, { type: 'playCard', seat: 0, card: c('7♦') }));
    expect(finding.better).toBe('Jogar Q♣');
  });

  it('does not flag a manilha that was the only winning card', () => {
    const match = setup(['7♦', 'Q♣', 'J♣'], RIVAL, 1, [{ type: 'playCard', seat: 1, card: c('3♥') }]);
    expect(kinds(decide(match, { type: 'playCard', seat: 0, card: c('7♦') }))).toEqual([]);
  });
});

describe('detector: burned the best card early', () => {
  it('flags opening the first round with the zap', () => {
    const match = setup(['4♣', 'K♣', 'Q♣'], RIVAL, 0);
    const [finding] = detectFindings(decide(match, { type: 'playCard', seat: 0, card: c('4♣') }));
    expect(finding.kind).toBe('burnedBestCard');
    expect(finding.better).toBe('Abrir com K♣ e guardar a manilha');
  });

  it('does not flag opening with a common card', () => {
    const match = setup(['4♣', 'K♣', 'Q♣'], RIVAL, 0);
    expect(kinds(decide(match, { type: 'playCard', seat: 0, card: c('K♣') }))).toEqual([]);
  });

  it('does not flag opening the second round with the zap', () => {
    const match = setup(['4♣', 'K♣', 'Q♣'], ['J♥', '2♥', '3♥'], 0, [
      { type: 'playCard', seat: 0, card: c('K♣') },
      { type: 'playCard', seat: 1, card: c('J♥') },
    ]);
    expect(kinds(decide(match, { type: 'playCard', seat: 0, card: c('4♣') }))).toEqual([]);
  });
});

describe('detectors: general', () => {
  it('mão de ferro is never judged (the player cannot see their cards)', () => {
    const match = setup(['4♣', '7♥', 'Q♣'], RIVAL, 0, [], { kind: 'iron' });
    expect(kinds(decide(match, { type: 'playCard', seat: 0, card: c('4♣') }))).toEqual([]);
  });

  it('roundsNeeded follows the cangou rules', () => {
    const rounds = (results: ('tie' | 0 | 1)[]) => results.map((result) => ({ plays: [], result }));
    expect(roundsNeeded(rounds([]), 0)).toBe(2);
    expect(roundsNeeded(rounds(['tie']), 0)).toBe(1);
    expect(roundsNeeded(rounds([0]), 0)).toBe(1);
    expect(roundsNeeded(rounds([1]), 0)).toBe(2);
    expect(roundsNeeded(rounds([1, 0]), 0)).toBe(1);
  });
});

describe('detectors: 2x2, the partner signals count', () => {
  // Seat 0 is the human. Seat 1 (rival) asks for truco right away; seat 0 answers.
  const WEAK_HAND = ['Q♣', 'J♣', 'K♣'];
  const RIVAL_1 = ['3♥', '2♥', 'J♥'];
  const RIVAL_2 = ['2♦', 'K♦', 'Q♦'];

  /** The partner (seat 2) holds partner and made signal, which the human saw. */
  function withPartnerSignal(
    mine: string[],
    partner: string[],
    signal: 'zap' | 'copas' | 'leaveItToMe' | 'nothing',
  ): MatchState {
    const base = createMatch({ playerCount: 4, targetScore: 12, seed: 1 });
    const start = createHand(4, [mine, RIVAL_1, partner, RIVAL_2].map((h) => h.map(c)), 1);
    const hand = applyAction(start, { type: 'raise', seat: 1 });
    return { ...base, hand: { ...hand, signals: [{ seat: 2, signal, seenBy: [0] }] } };
  }

  it('accepting with a weak hand is NOT a mistake when the partner showed the zap', () => {
    expect(kinds(decide(withPartnerSignal(WEAK_HAND, ['4♣', 'J♥', 'Q♠'], 'zap'), ACCEPT))).toEqual([]);
  });

  it('accepting with a weak hand is NOT a mistake when the partner said "deixa comigo"', () => {
    expect(kinds(decide(withPartnerSignal(WEAK_HAND, ['4♣', '7♥', 'Q♠'], 'leaveItToMe'), ACCEPT))).toEqual([]);
  });

  it('still a mistake when the partner signaled "nothing"', () => {
    const [finding] = detectFindings(decide(withPartnerSignal(WEAK_HAND, ['J♠', 'Q♥', 'Q♠'], 'nothing'), ACCEPT));
    expect(finding.kind).toBe('acceptedWeak');
  });

  it('running counts the partner announced cards: own zap + partner copas = 2 safe rounds', () => {
    const [finding] = detectFindings(decide(withPartnerSignal(['4♣', 'K♣', 'Q♣'], ['7♥', 'J♠', 'Q♠'], 'copas'), RUN));
    expect(finding.kind).toBe('ranFromStrong');
    expect(finding.why).toContain('seu parceiro sinalizou o copas');
  });
});
