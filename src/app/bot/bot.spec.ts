import { PlayerCount } from '../engine/card';
import { applyAction, createHand, getLegalActions, HandAction, HandMode, HandState } from '../engine/hand';
import { applyMatchAction, createMatch, getMatchLegalActions, MatchConfig, MatchState, startNextHand } from '../engine/match';
import { createRng } from '../engine/random';
import { c } from '../engine/testing';
import { getPlayerView } from '../engine/view';
import { acceptIsWorthIt, BotParams, chooseAction, DEFAULT_BOT, matchWinChance, winChance } from './bot';

const NO_BLUFF: BotParams = { aggressiveness: 0.5, bluffChance: 0 };

/** A match whose current hand has the given cards (seat 0 leads). */
function matchWith(hands: string[][], mode?: HandMode, leadSeat = 0): MatchState {
  const playerCount = hands.length as PlayerCount;
  const base = createMatch({ playerCount, targetScore: 12, seed: 1 });
  return { ...base, hand: createHand(playerCount, hands.map((h) => h.map(c)), leadSeat, mode) };
}

/** Applies hand actions directly (to set up a situation). */
function withActions(match: MatchState, ...actions: HandAction[]): MatchState {
  const hand = actions.reduce((h: HandState, action) => applyAction(h, action), match.hand);
  return { ...match, hand };
}

function botMove(match: MatchState, seat: number, params: BotParams = NO_BLUFF): HandAction {
  return chooseAction(getPlayerView(match, seat), getLegalActions(match.hand), params, createRng(1));
}

const STRONG = ['4♣', '7♥', '3♣'];
const WEAK = ['Q♥', 'J♣', 'K♥'];
// About 50% to win against a truco: worth accepting (needs 33%), not worth raising.
const MEDIUM = ['A♣', 'K♥', '2♥'];

describe('winChance', () => {
  it('is high with manilhas and low with small cards', () => {
    expect(winChance(getPlayerView(matchWith([STRONG, WEAK]), 0))).toBeGreaterThan(0.75);
    expect(winChance(getPlayerView(matchWith([STRONG, WEAK]), 1))).toBeLessThan(0.15);
  });
});

describe('bot: betting', () => {
  it('asks for truco with a strong hand', () => {
    expect(botMove(matchWith([STRONG, WEAK]), 0)).toEqual({ type: 'raise', seat: 0 });
  });

  it('just plays a card with a weak hand (no bluff)', () => {
    expect(botMove(matchWith([WEAK, STRONG]), 0).type).toBe('playCard');
  });

  it('runs from truco with a weak hand (no bluff)', () => {
    const match = withActions(matchWith([STRONG, WEAK]), { type: 'raise', seat: 0 });
    expect(botMove(match, 1)).toEqual({ type: 'run', seat: 1 });
  });

  it('accepts truco with a medium hand', () => {
    const match = withActions(matchWith([STRONG, MEDIUM]), { type: 'raise', seat: 0 });
    expect(botMove(match, 1)).toEqual({ type: 'accept', seat: 1 });
  });

  it('answers truco with seis when very strong', () => {
    const match = withActions(matchWith([WEAK, STRONG]), { type: 'raise', seat: 0 });
    expect(botMove(match, 1)).toEqual({ type: 'raise', seat: 1 });
  });

  it('never asks for truco in a mão de 11, even always bluffing', () => {
    const eleven = withActions(matchWith([STRONG, WEAK], { kind: 'eleven', team: 0 }), {
      type: 'accept',
      seat: 0,
    });
    const alwaysBluff: BotParams = { aggressiveness: 1, bluffChance: 1 };
    expect(botMove(eleven, 0, alwaysBluff).type).toBe('playCard');
  });

  it('mão de 11: plays with a strong hand, runs with a weak one', () => {
    expect(botMove(matchWith([STRONG, WEAK], { kind: 'eleven', team: 0 }), 0).type).toBe('accept');
    expect(botMove(matchWith([WEAK, STRONG], { kind: 'eleven', team: 0 }), 0).type).toBe('run');
  });
});

describe('bot: playing cards', () => {
  /** Which card the bot plays, offering it only card plays (no truco), to test card choice alone. */
  const playOf = (match: MatchState, seat: number) => {
    const plays = getLegalActions(match.hand).filter((a) => a.type === 'playCard');
    const action = chooseAction(getPlayerView(match, seat), plays, NO_BLUFF, createRng(1));
    return action.type === 'playCard' ? action.card : null;
  };

  it('plays the cheapest card that wins', () => {
    const match = withActions(matchWith([['K♣', 'Q♥', 'J♥'], ['3♣', 'A♣', 'Q♣']]), {
      type: 'playCard',
      seat: 0,
      card: c('K♣'),
    });
    expect(playOf(match, 1)).toEqual(c('A♣'));
  });

  it('throws away the weakest card when it cannot win', () => {
    const match = withActions(matchWith([['3♣', 'Q♥', 'J♥'], ['K♣', 'J♣', 'Q♣']]), {
      type: 'playCard',
      seat: 0,
      card: c('3♣'),
    });
    expect(playOf(match, 1)).toEqual(c('Q♣'));
  });

  it('opens the first round with the middle card', () => {
    expect(playOf(matchWith([['3♣', 'K♣', 'Q♣'], WEAK]), 0)).toEqual(c('K♣'));
  });

  it('2x2: plays the weakest when the partner is winning', () => {
    const match = withActions(
      matchWith([['3♣', 'A♥', 'A♦'], ['Q♣', '2♥', '2♦'], ['2♣', 'K♥', 'Q♥'], ['J♣', 'K♦', 'Q♦']]),
      { type: 'playCard', seat: 0, card: c('3♣') },
      { type: 'playCard', seat: 1, card: c('Q♣') },
    );
    expect(playOf(match, 2)).toEqual(c('Q♥'));
  });
});

describe('bot vs bot', () => {
  function playBotMatch(config: MatchConfig): MatchState {
    const rng = createRng(config.seed);
    let state = createMatch(config);
    for (let steps = 0; !state.finished; steps++) {
      if (steps > 10_000) {
        throw new Error('Match did not end');
      }
      if (state.hand.finished) {
        state = startNextHand(state);
        continue;
      }
      const legal = getMatchLegalActions(state);
      const seat = legal[0].seat;
      // applyMatchAction throws if the bot ever picks an illegal action.
      state = applyMatchAction(state, chooseAction(getPlayerView(state, seat), legal, DEFAULT_BOT, rng));
    }
    return state;
  }

  it('finishes whole matches using only legal actions', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(playBotMatch({ playerCount: 2, targetScore: 12, seed }).finished).toBe(true);
      expect(playBotMatch({ playerCount: 4, targetScore: 24, seed }).finished).toBe(true);
    }
  });
});

describe('bot: signals', () => {
  const four = [['4♣', 'K♣', 'Q♣'], ['3♥', 'K♥', 'Q♥'], ['J♣', 'J♥', 'Q♠'], ['2♦', 'K♦', 'Q♦']];

  it('signals its best card truthfully', () => {
    const base = matchWith(four);
    const match = { ...base, hand: { ...base.hand, signalingSeat: 0, signalWatchers: [[2], [3], [0], [1]] } };
    const action = chooseAction(getPlayerView(match, 0), getLegalActions(match.hand), NO_BLUFF, createRng(1));
    expect(action).toEqual({ type: 'signal', seat: 0, signal: 'zap' });
  });

  it('a partner signal of zap makes a weak bot accept a truco it would run from', () => {
    // Seat 1 asks for truco; seat 2 (weak: J, J, Q) answers for its team.
    const asked = withActions(matchWith(four), { type: 'playCard', seat: 0, card: c('Q♣') }, { type: 'raise', seat: 1 });
    expect(botMove(asked, 2)).toEqual({ type: 'run', seat: 2 });

    const withSignal = {
      ...asked,
      hand: { ...asked.hand, signals: [{ seat: 0, signal: 'zap' as const, seenBy: [2] }] },
    };
    expect(botMove(withSignal, 2)).toEqual({ type: 'accept', seat: 2 });
  });

  it('a caught rival signal makes it more careful', () => {
    const view = getPlayerView(matchWith(four), 2);
    const warned = { ...view, knownSignals: [{ seat: 1, signal: 'zap' as const }] };
    expect(winChance(warned)).toBeLessThan(winChance(view));
  });
});

describe('winChance: card counting', () => {
  it('copas gets safer once the zap has been played', () => {
    // Seat 0 holds copas; seat 1 plays the zap in round 1.
    const before = matchWith([['7♥', 'K♣', 'Q♣'], ['4♣', 'J♥', 'Q♥']]);
    const after = withActions(
      matchWith([['7♥', 'K♣', 'Q♣'], ['4♣', 'J♥', 'Q♥']], undefined, 1),
      { type: 'playCard', seat: 1, card: c('4♣') },
    );
    expect(winChance(getPlayerView(after, 0))).toBeGreaterThan(winChance(getPlayerView(before, 0)));
  });
});

describe("matchWinChance (gambler's ruin)", () => {
  it('is 50% at an even score, high when one point away, final at the target', () => {
    expect(matchWinChance(0, 0, 12)).toBe(0.5);
    expect(matchWinChance(11, 0, 12)).toBeCloseTo(12 / 13);
    expect(matchWinChance(12, 11, 12)).toBe(1);
    expect(matchWinChance(3, 13, 12)).toBe(0);
  });
});

describe('acceptIsWorthIt: the score matters', () => {
  const NEUTRAL: BotParams = { aggressiveness: 0.5, bluffChance: 0 };
  const view = getPlayerView(matchWith([['K♣', 'Q♣', 'J♣'], ['K♥', 'Q♥', 'J♥']]), 0);
  const at = (mine: number, theirs: number) => ({ ...view, scores: [mine, theirs] as [number, number] });
  // Safety margin is 0.1, so "chance" here = what the bot believes + 0.1.

  it('early in the match it is the pot-odds rule: accept a truco from about 1/3', () => {
    expect(acceptIsWorthIt(at(0, 0), 1 / 3 + 0.1 + 0.03, NEUTRAL, 3, 1)).toBe(true);
    expect(acceptIsWorthIt(at(0, 0), 1 / 3 + 0.1 - 0.03, NEUTRAL, 3, 1)).toBe(false);
  });

  it('if losing the truco hands the rivals the match (they have 9), it gets careful', () => {
    expect(acceptIsWorthIt(at(0, 0), 0.45, NEUTRAL, 3, 1)).toBe(true);
    expect(acceptIsWorthIt(at(0, 9), 0.45, NEUTRAL, 3, 1)).toBe(false);
  });

  it('if running hands the rivals the match, it accepts anything', () => {
    // Rivals have 9, the hand is worth 3, they ask for seis: running gives them 12.
    expect(acceptIsWorthIt(at(0, 9), 0, NEUTRAL, 6, 3)).toBe(true);
  });

  it('mão de 11: plays a 50% hand when the rivals are far, runs when they are close', () => {
    // On 11, winning is the match. Running gives 1: harmless at 11x0, scary at 11x9.
    expect(acceptIsWorthIt(at(11, 0), 0.5, NEUTRAL, 3, 1)).toBe(true);
    expect(acceptIsWorthIt(at(11, 9), 0.5, NEUTRAL, 3, 1)).toBe(false);
  });
});

describe('bot: reading bets and bluffing', () => {
  const ALWAYS_BLUFF: BotParams = { aggressiveness: 0.5, bluffChance: 1 };

  it('a rival truco lowers its win chance (the rival is probably strong)', () => {
    // withActions skips the match history, so the raise is set on the view directly.
    const asked = withActions(matchWith([STRONG, MEDIUM]), { type: 'raise', seat: 0 });
    const view = getPlayerView(asked, 1);
    expect(winChance({ ...view, raisedBy: [0] })).toBeLessThan(winChance(view));
  });

  it('never "calls a bluff" below the break-even chance, even when bluffy', () => {
    const asked = withActions(matchWith([STRONG, WEAK]), { type: 'raise', seat: 0 });
    expect(botMove(asked, 1, ALWAYS_BLUFF)).toEqual({ type: 'run', seat: 1 });
  });

  it('does not bluff while the rivals probably hold a manilha', () => {
    expect(botMove(matchWith([WEAK, ['3♣', '2♥', 'A♥']]), 0, ALWAYS_BLUFF).type).toBe('playCard');
  });

  it('bluffs once the manilhas are mostly gone', () => {
    // Round 1: zap beats copas. Round 2: seat 0 leads K♣, and seat 1 (J♥ Q♥, weak) may bluff.
    const match = withActions(
      matchWith([['4♣', 'K♣', 'Q♣'], ['7♥', 'J♥', 'Q♥']]),
      { type: 'playCard', seat: 0, card: c('4♣') },
      { type: 'playCard', seat: 1, card: c('7♥') },
      { type: 'playCard', seat: 0, card: c('K♣') },
    );
    expect(botMove(match, 1, ALWAYS_BLUFF)).toEqual({ type: 'raise', seat: 1 });
  });
});

describe('bot: deixa comigo (partner said "leave it to me")', () => {
  const four = [['4♣', 'K♣', 'Q♣'], ['3♥', 'K♥', 'Q♥'], ['J♣', 'J♥', 'Q♠'], ['2♦', 'K♦', 'Q♦']];
  /** Seat 2's view, with its partner (seat 0) having signaled "deixa comigo". */
  const withLeaveItToMe = (match: MatchState): MatchState => ({
    ...match,
    hand: { ...match.hand, signals: [{ seat: 0, signal: 'leaveItToMe' as const, seenBy: [2] }] },
  });

  it('plays its smallest card', () => {
    const match = withLeaveItToMe(
      withActions(matchWith(four), { type: 'playCard', seat: 0, card: c('Q♣') }, { type: 'playCard', seat: 1, card: c('3♥') }),
    );
    expect(botMove(match, 2)).toEqual({ type: 'playCard', seat: 2, card: c('Q♠') });
  });

  it('never runs, even from a seis with a weak hand', () => {
    const match = withLeaveItToMe(
      withActions(matchWith(four), { type: 'playCard', seat: 0, card: c('Q♣') }, { type: 'raise', seat: 1 }),
    );
    expect(botMove(match, 2).type).toBe('accept');
  });

  it('does not ask for truco on its own, even with a strong hand', () => {
    const strong = [['4♣', 'K♣', 'Q♣'], ['3♥', 'K♥', 'Q♥'], ['7♥', 'A♠', '3♠'], ['2♦', 'K♦', 'Q♦']];
    const match = withLeaveItToMe(
      withActions(matchWith(strong), { type: 'playCard', seat: 0, card: c('Q♣') }, { type: 'playCard', seat: 1, card: c('Q♥') }),
    );
    expect(botMove(match, 2).type).toBe('playCard');
  });
});

describe('bot: ties (cangar) on purpose', () => {
  const playOnly = (match: MatchState, seat: number) => {
    const plays = getLegalActions(match.hand).filter((a) => a.type === 'playCard');
    return chooseAction(getPlayerView(match, seat), plays, NO_BLUFF, createRng(1));
  };

  it('after a tied first round, ties again rather than throwing its smallest card', () => {
    // Round 1: 3♥ x 3♣ tie; seat 1 opens round 2 with 2♥; seat 0 can't beat it but can tie with 2♣.
    const match = withActions(
      matchWith([['3♣', '2♣', 'Q♣'], ['3♥', '2♥', 'J♥']], undefined, 1),
      { type: 'playCard', seat: 1, card: c('3♥') },
      { type: 'playCard', seat: 0, card: c('3♣') },
      { type: 'playCard', seat: 1, card: c('2♥') },
    );
    expect(playOnly(match, 0)).toEqual({ type: 'playCard', seat: 0, card: c('2♣') });
  });

  it('after losing the first round a tie loses too, so it throws its smallest card', () => {
    const match = withActions(
      matchWith([['Q♣', '2♣', 'J♣'], ['3♥', '2♥', 'K♥']], undefined, 1),
      { type: 'playCard', seat: 1, card: c('3♥') },
      { type: 'playCard', seat: 0, card: c('Q♣') },
      { type: 'playCard', seat: 1, card: c('2♥') },
    );
    expect(playOnly(match, 0)).toEqual({ type: 'playCard', seat: 0, card: c('J♣') });
  });
});

describe('bot: both partners said "deixa comigo"', () => {
  it('plays on its own judgment (takes the round) instead of waiting for the partner', () => {
    const four = [['Q♣', 'K♣', 'J♣'], ['3♥', 'K♥', 'Q♥'], ['4♣', '7♥', 'Q♠'], ['2♦', 'K♦', 'Q♦']];
    const base = withActions(matchWith(four), { type: 'playCard', seat: 0, card: c('Q♣') }, { type: 'playCard', seat: 1, card: c('3♥') });
    const match = {
      ...base,
      hand: {
        ...base.hand,
        signals: [
          { seat: 0, signal: 'leaveItToMe' as const, seenBy: [2] },
          { seat: 2, signal: 'leaveItToMe' as const, seenBy: [0] },
        ],
      },
    };
    const plays = getLegalActions(match.hand).filter((a) => a.type === 'playCard');
    const action = chooseAction(getPlayerView(match, 2), plays, NO_BLUFF, createRng(1));
    // The rival's 3♥ is winning: the bot beats it with its cheapest manilha, copas 7♥.
    expect(action).toEqual({ type: 'playCard', seat: 2, card: c('7♥') });
  });
});
