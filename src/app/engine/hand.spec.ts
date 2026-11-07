import { applyAction, createHand, currentSeat, getLegalActions, HandState } from './hand';
import { c } from './testing';

function hand1x1(seat0: string[], seat1: string[]): HandState {
  return createHand(2, [seat0.map(c), seat1.map(c)], 0);
}

/** Plays the given cards in order, each by whoever's turn it is. */
function play(state: HandState, ...cards: string[]): HandState {
  return cards.reduce(
    (s, card) => applyAction(s, { type: 'playCard', seat: currentSeat(s), card: c(card) }),
    state,
  );
}

describe('hand: turns and legal actions', () => {
  const start = hand1x1(['3♣', '2♣', 'K♣'], ['Q♣', 'J♣', 'Q♥']);

  it('lead seat plays first, with any of their 3 cards', () => {
    const actions = getLegalActions(start);
    expect(actions.filter((a) => a.type === 'playCard')).toHaveLength(3);
    actions.forEach((action) => expect(action.seat).toBe(0));
  });

  it('playing a card removes it from the hand and passes the turn', () => {
    const next = play(start, '3♣');
    expect(next.hands[0]).toHaveLength(2);
    expect(next.currentPlays).toEqual([{ seat: 0, card: c('3♣') }]);
    expect(currentSeat(next)).toBe(1);
  });

  it('does not change the previous state', () => {
    const before = structuredClone(start);
    play(start, '3♣');
    expect(start).toEqual(before);
  });

  it('rejects playing out of turn', () => {
    expect(() => applyAction(start, { type: 'playCard', seat: 1, card: c('Q♣') })).toThrow();
  });

  it('rejects a card the player does not have', () => {
    expect(() => applyAction(start, { type: 'playCard', seat: 0, card: c('A♥') })).toThrow();
  });

  it('round winner leads the next round', () => {
    const state = play(hand1x1(['Q♥', 'J♥', 'K♣'], ['3♣', 'J♣', 'Q♣']), 'Q♥', '3♣');
    expect(state.completedRounds[0].result).toBe(1);
    expect(currentSeat(state)).toBe(1);
  });

  it('no legal actions after the hand is finished', () => {
    const state = play(start, '3♣', 'Q♣', '2♣', 'J♣');
    expect(state.finished).toBe(true);
    expect(getLegalActions(state)).toEqual([]);
  });
});

describe('hand: winner', () => {
  it('winning the first two rounds ends the hand', () => {
    const state = play(hand1x1(['3♣', '2♣', 'K♣'], ['Q♣', 'J♣', 'Q♥']), '3♣', 'Q♣', '2♣', 'J♣');
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.completedRounds).toHaveLength(2);
  });

  it('1–1 goes to the third round', () => {
    const start = hand1x1(['3♣', 'J♥', '2♣'], ['Q♣', '2♥', 'K♣']);
    const afterTwo = play(start, '3♣', 'Q♣', 'J♥', '2♥');
    expect(afterTwo.finished).toBe(false);

    // Seat 1 won round 2, so seat 1 leads round 3.
    const state = play(afterTwo, 'K♣', '2♣');
    expect(state.winner).toBe(0);
  });
});

describe('hand: cangou (tie)', () => {
  it('first round tied: next round decides', () => {
    const state = play(hand1x1(['3♣', 'Q♥', 'J♥'], ['3♥', 'K♣', '2♣']), '3♣', '3♥', 'Q♥', 'K♣');
    expect(state.completedRounds[0].result).toBe('tie');
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(1);
  });

  it('after a tie, whoever opened the tied round opens the next', () => {
    const state = play(hand1x1(['3♣', 'Q♥', 'J♥'], ['3♥', 'K♣', '2♣']), '3♣', '3♥');
    expect(currentSeat(state)).toBe(0);
  });

  it('first round won, second tied: first round winner takes the hand', () => {
    const state = play(hand1x1(['3♣', 'K♣', 'J♥'], ['Q♣', 'K♥', 'Q♥']), '3♣', 'Q♣', 'K♣', 'K♥');
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(0);
  });

  it('1–1 and third tied: first round winner takes the hand', () => {
    const start = hand1x1(['3♣', 'J♥', 'K♣'], ['Q♣', '2♣', 'K♥']);
    // Round 1 -> seat 0, round 2 -> seat 1 (who leads round 3), round 3 tied.
    const state = play(start, '3♣', 'Q♣', 'J♥', '2♣', 'K♥', 'K♣');
    expect(state.completedRounds.map((r) => r.result)).toEqual([0, 1, 'tie']);
    expect(state.winner).toBe(0);
  });

  it('first two tied: third round decides', () => {
    const state = play(hand1x1(['3♣', '2♣', 'K♣'], ['3♥', '2♥', 'Q♣']), '3♣', '3♥', '2♣', '2♥');
    expect(state.finished).toBe(false);
    expect(play(state, 'K♣', 'Q♣').winner).toBe(0);
  });

  it('all three tied: nobody wins', () => {
    const start = hand1x1(['3♣', '2♣', 'K♣'], ['3♥', '2♥', 'K♥']);
    const state = play(start, '3♣', '3♥', '2♣', '2♥', 'K♣', 'K♥');
    expect(state.finished).toBe(true);
    expect(state.winner).toBeNull();
  });
});

describe('hand: 2x2', () => {
  const start = createHand(
    4,
    [
      ['3♣', 'K♣', 'A♣'].map(c),
      ['Q♣', 'K♥', 'A♥'].map(c),
      ['3♥', 'K♠', '2♠'].map(c),
      ['J♣', 'K♦', 'A♦'].map(c),
    ],
    0,
  );

  it('round only ends after all 4 players play', () => {
    const state = play(start, '3♣', 'Q♣', '3♥');
    expect(state.completedRounds).toHaveLength(0);
    expect(currentSeat(state)).toBe(3);
  });

  it('partners tying on the highest card win the round for their team', () => {
    const state = play(start, '3♣', 'Q♣', '3♥', 'J♣');
    expect(state.completedRounds[0].result).toBe(0);
    expect(currentSeat(state)).toBe(0); // first to play the winning rank
  });

  it('opponents tying on the highest card is a cangou', () => {
    const tied = createHand(
      4,
      [
        ['3♣', 'K♣', 'A♣'].map(c),
        ['3♥', 'K♥', 'A♥'].map(c),
        ['Q♣', 'K♠', '2♠'].map(c),
        ['J♣', 'K♦', 'A♦'].map(c),
      ],
      0,
    );
    const state = play(tied, '3♣', '3♥', 'Q♣', 'J♣');
    expect(state.completedRounds[0].result).toBe('tie');
    expect(currentSeat(state)).toBe(0);
  });
});

/** Raise, accept or run by whoever may act now (the responder if a bet is pending). */
function bet(state: HandState, type: 'raise' | 'accept' | 'run'): HandState {
  const seat = state.pendingBet ? state.pendingBet.responderSeat : currentSeat(state);
  return applyAction(state, { type, seat });
}

describe('hand: betting', () => {
  const start = hand1x1(['3♣', '2♣', 'K♣'], ['Q♣', 'J♣', 'Q♥']);

  it('starts worth 1, and the player to act may ask for truco', () => {
    expect(start.stake).toBe(1);
    expect(getLegalActions(start)).toContainEqual({ type: 'raise', seat: 0 });
  });

  it('asking for truco waits for the opponent: only accept, run or seis', () => {
    const state = bet(start, 'raise');
    expect(state.pendingBet).toEqual({ requested: 3, callerSeat: 0, responderSeat: 1 });
    expect(getLegalActions(state)).toEqual([
      { type: 'accept', seat: 1 },
      { type: 'run', seat: 1 },
      { type: 'raise', seat: 1 },
    ]);
  });

  it('no card can be played while a bet is pending', () => {
    const state = bet(start, 'raise');
    expect(() => applyAction(state, { type: 'playCard', seat: 0, card: c('3♣') })).toThrow();
  });

  it('accepting sets the stake and gives the turn back to whoever was playing', () => {
    const state = bet(bet(start, 'raise'), 'accept');
    expect(state.stake).toBe(3);
    expect(state.pendingBet).toBeNull();
    expect(currentSeat(state)).toBe(0);
  });

  it('after accepting, only the accepting team may raise', () => {
    const accepted = bet(bet(start, 'raise'), 'accept');
    // Seat 0 asked for truco, so seat 0 cannot ask for seis.
    expect(getLegalActions(accepted)).not.toContainEqual({ type: 'raise', seat: 0 });

    // Seat 1 accepted, so on their turn they may ask for seis.
    const seat1Turn = play(accepted, '3♣');
    expect(getLegalActions(seat1Turn)).toContainEqual({ type: 'raise', seat: 1 });
  });

  it('running from truco gives 1 point to the caller', () => {
    const state = bet(bet(start, 'raise'), 'run');
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.stake).toBe(1);
  });

  it('answering truco with seis accepts the truco: running from seis gives 3', () => {
    const seis = bet(bet(start, 'raise'), 'raise');
    expect(seis.stake).toBe(3);
    expect(seis.pendingBet).toEqual({ requested: 6, callerSeat: 1, responderSeat: 0 });

    const state = bet(seis, 'run');
    expect(state.winner).toBe(1);
    expect(state.stake).toBe(3);
  });

  it('nobody can raise past doze', () => {
    let state = start;
    for (let i = 0; i < 4; i++) {
      state = bet(state, 'raise'); // truco, seis, nove, doze
    }
    expect(state.pendingBet?.requested).toBe(12);
    expect(getLegalActions(state).map((a) => a.type)).toEqual(['accept', 'run']);

    const accepted = bet(state, 'accept');
    expect(accepted.stake).toBe(12);
    expect(getLegalActions(accepted).some((a) => a.type === 'raise')).toBe(false);
  });

  it('a hand decided by cards keeps the accepted stake', () => {
    const accepted = bet(bet(start, 'raise'), 'accept');
    const state = play(accepted, '3♣', 'Q♣', '2♣', 'J♣');
    expect(state.winner).toBe(0);
    expect(state.stake).toBe(3);
  });

  it('2x2: the next opponent answers, and a counter-raise is answered by the next seat', () => {
    const fourPlayers = createHand(
      4,
      [['3♣'], ['Q♣'], ['3♥'], ['J♣']].map((hand) => hand.map(c)),
      0,
    );
    const truco = bet(fourPlayers, 'raise');
    expect(truco.pendingBet?.responderSeat).toBe(1);

    const seis = bet(truco, 'raise');
    expect(seis.pendingBet?.responderSeat).toBe(2);
  });
});

describe('hand: mão de 11', () => {
  const cards = [['3♣', '2♣', 'K♣'].map(c), ['Q♣', 'J♣', 'Q♥'].map(c)];
  const eleven = createHand(2, cards, 0, { kind: 'eleven', team: 1 });

  it('the team on 11 must decide first: play (accept) or run', () => {
    expect(getLegalActions(eleven)).toEqual([
      { type: 'accept', seat: 1 },
      { type: 'run', seat: 1 },
    ]);
  });

  it('running gives 1 point to the other team', () => {
    const state = applyAction(eleven, { type: 'run', seat: 1 });
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(0);
    expect(state.stake).toBe(1);
  });

  it('playing makes the hand worth 3, then cards are played normally', () => {
    const state = applyAction(eleven, { type: 'accept', seat: 1 });
    expect(state.stake).toBe(3);
    expect(currentSeat(state)).toBe(0);
    expect(getLegalActions(state).filter((a) => a.type === 'playCard')).toHaveLength(3);
  });

  it('truco is offered, but asking for it loses the hand', () => {
    const playing = applyAction(eleven, { type: 'accept', seat: 1 });
    expect(getLegalActions(playing)).toContainEqual({ type: 'raise', seat: 0 });

    const state = applyAction(playing, { type: 'raise', seat: 0 });
    expect(state.finished).toBe(true);
    expect(state.winner).toBe(1);
    expect(state.stake).toBe(3);
  });

  it('2x2: the decider is the team player closest to being mão', () => {
    const four = [['3♣'], ['Q♣'], ['3♥'], ['J♣']].map((hand) => hand.map(c));
    // Seat 1 is mão; team 0 is on 11, so seat 2 (right after seat 1) decides.
    expect(createHand(4, four, 1, { kind: 'eleven', team: 0 }).elevenDeciderSeat).toBe(2);
    // Seat 0 is mão and is on team 0: they decide.
    expect(createHand(4, four, 0, { kind: 'eleven', team: 0 }).elevenDeciderSeat).toBe(0);
  });
});

describe('hand: mão de ferro', () => {
  const iron = createHand(2, [['3♣', '2♣', 'K♣'].map(c), ['Q♣', 'J♣', 'Q♥'].map(c)], 0, {
    kind: 'iron',
  });

  it('is worth 1 and starts straight away with cards', () => {
    expect(iron.stake).toBe(1);
    expect(iron.elevenDeciderSeat).toBeNull();
    expect(getLegalActions(iron).filter((a) => a.type === 'playCard')).toHaveLength(3);
  });

  it('asking for truco loses the hand', () => {
    const state = applyAction(iron, { type: 'raise', seat: 0 });
    expect(state.winner).toBe(1);
    expect(state.stake).toBe(1);
  });
});

describe('hand: signal round (2x2)', () => {
  const cards = [['4♣', 'K♣', 'Q♣'], ['3♥', 'K♥', 'Q♥'], ['J♣', 'K♠', 'Q♠'], ['2♦', 'K♦', 'Q♦']].map((h) =>
    h.map(c),
  );
  // Partners always see; seat 1 also catches seat 0's signal.
  const watchers = [[2, 1], [3], [0], [1]];
  const start = createHand(4, cards, 0, { kind: 'normal' }, watchers);

  const signalAll = (state: HandState) =>
    [0, 1, 2, 3].reduce(
      (s, seat) => applyAction(s, { type: 'signal', seat, signal: seat === 3 ? null : 'zap' }),
      state,
    );

  it('starts with the lead seat signaling: 7 signals + staying quiet, nothing else', () => {
    const actions = getLegalActions(start);
    expect(actions).toHaveLength(8);
    actions.forEach((a) => {
      expect(a.type).toBe('signal');
      expect(a.seat).toBe(0);
    });
  });

  it('goes around the table once, then cards can be played', () => {
    const state = signalAll(start);
    expect(state.signalingSeat).toBeNull();
    expect(state.signals.map((s) => s.seat)).toEqual([0, 1, 2, 3]);
    expect(getLegalActions(state).some((a) => a.type === 'playCard' && a.seat === 0)).toBe(true);
  });

  it('records who saw each signal; staying quiet is seen by nobody', () => {
    const state = signalAll(start);
    expect(state.signals[0].seenBy).toEqual([2, 1]);
    expect(state.signals[3]).toEqual({ seat: 3, signal: null, seenBy: [] });
  });

  it('no signal round without watchers (1x1, mão de 11, mão de ferro)', () => {
    expect(createHand(4, cards, 0).signalingSeat).toBeNull();
  });
});

describe('hand: "faz a primeira?" (2x2)', () => {
  const cards = [['K♣', 'Q♣', 'J♣'], ['3♥', 'K♥', 'Q♥'], ['4♣', 'J♥', 'Q♠'], ['2♦', 'K♦', 'Q♦']].map((h) => h.map(c));
  const start = createHand(4, cards, 0);
  const ask = (state: HandState) => applyAction(state, { type: 'askFirst', seat: 0 });

  it('can be asked before the first card, by the player whose turn it is', () => {
    expect(getLegalActions(start)).toContainEqual({ type: 'askFirst', seat: 0 });
  });

  it('only the partner can answer while the question is pending: faço, talvez, não faço', () => {
    expect(getLegalActions(ask(start))).toEqual([
      { type: 'answerFirst', seat: 2, answer: 'yes' },
      { type: 'answerFirst', seat: 2, answer: 'maybe' },
      { type: 'answerFirst', seat: 2, answer: 'no' },
    ]);
  });

  it('the answer is recorded and the turn goes back to the asker, who cannot ask again', () => {
    const answered = applyAction(ask(start), { type: 'answerFirst', seat: 2, answer: 'yes' });
    expect(answered.talk).toEqual([{ askerSeat: 0, answererSeat: 2, answer: 'yes' }]);
    expect(currentSeat(answered)).toBe(0);
    expect(getLegalActions(answered).some((a) => a.type === 'askFirst')).toBe(false);
  });

  it('not once the partner has played, and not after the first round', () => {
    // Seat 0, 1 play; seat 2's partner (seat 0) already played: seat 2 cannot ask.
    const afterTwo = play(start, 'K♣', '3♥');
    expect(getLegalActions(afterTwo).some((a) => a.type === 'askFirst')).toBe(false);
    const roundTwo = play(start, 'K♣', '3♥', '4♣', '2♦');
    expect(getLegalActions(roundTwo).some((a) => a.type === 'askFirst')).toBe(false);
  });

  it('not in 1x1 or in a mão de 11', () => {
    expect(getLegalActions(hand1x1(['K♣', 'Q♣', 'J♣'], ['3♥', 'K♥', 'Q♥'])).some((a) => a.type === 'askFirst')).toBe(false);
    const eleven = applyAction(createHand(4, cards, 0, { kind: 'eleven', team: 0 }), { type: 'accept', seat: 0 });
    expect(getLegalActions(eleven).some((a) => a.type === 'askFirst')).toBe(false);
  });
});
