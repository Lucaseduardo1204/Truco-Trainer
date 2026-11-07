import { applyMatchAction, createMatch, MatchState, startNextHand } from './match';
import { getPlayerView } from './view';

describe('getPlayerView', () => {
  const match = createMatch({ playerCount: 2, targetScore: 12, seed: 5 });

  it('shows only the seat own cards', () => {
    const view = getPlayerView(match, 0);
    expect(view.ownCards).toEqual(match.hand.hands[0]);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(match.hand.hands[1]));
  });

  it('has no field holding everyone else hands', () => {
    expect(Object.keys(getPlayerView(match, 1))).not.toContain('hands');
  });

  it('hides own cards in mão de ferro', () => {
    const iron: MatchState = { ...match, hand: { ...match.hand, mode: { kind: 'iron' } } };
    expect(getPlayerView(iron, 0).ownCards).toEqual([]);
  });

  it('includes public information: score, stake and team', () => {
    const view = getPlayerView(match, 1);
    expect(view.scores).toEqual([0, 0]);
    expect(view.stake).toBe(1);
    expect(view.team).toBe(1);
  });
});

describe('getPlayerView: raises', () => {
  it('lists who raised in the current hand only', () => {
    let state = createMatch({ playerCount: 2, targetScore: 12, seed: 5 });
    const raiser = state.hand.leadSeat;
    state = applyMatchAction(state, { type: 'raise', seat: raiser });
    expect(getPlayerView(state, 0).raisedBy).toEqual([raiser]);

    // The other player runs: the hand ends, and the next hand starts with no raises.
    state = startNextHand(applyMatchAction(state, { type: 'run', seat: 1 - raiser }));
    expect(getPlayerView(state, 0).raisedBy).toEqual([]);
  });
});

describe('getPlayerView: signals', () => {
  it('shows own and partner signals, and rival signals only if caught', () => {
    const base = createMatch({ playerCount: 4, targetScore: 12, seed: 5 });
    const hand = {
      ...base.hand,
      signalingSeat: null,
      signals: [
        { seat: 0, signal: 'zap' as const, seenBy: [2] },
        { seat: 1, signal: 'tres' as const, seenBy: [3, 0] }, // seat 0 caught it
        { seat: 2, signal: 'copas' as const, seenBy: [0] },
        { seat: 3, signal: 'nothing' as const, seenBy: [1] },
      ],
    };
    const view = getPlayerView({ ...base, hand }, 0);
    expect(view.knownSignals.map((s) => s.seat)).toEqual([0, 1, 2]);
  });
});
