import { currentSeat, teamOf } from './hand';
import { createRng } from './random';
import {
  applyMatchAction,
  createMatch,
  getMatchLegalActions,
  handModeFor,
  HistoryEntry,
  MatchConfig,
  MatchState,
  startNextHand,
} from './match';

const config: MatchConfig = { playerCount: 2, targetScore: 12, seed: 123 };

/** Ends the current (normal) hand fast: the player to act asks for truco and the opponent runs. */
function raiseAndRun(state: MatchState): MatchState {
  const seat = currentSeat(state.hand);
  const raised = applyMatchAction(state, { type: 'raise', seat });
  return applyMatchAction(raised, { type: 'run', seat: raised.hand.pendingBet!.responderSeat });
}

describe('createMatch', () => {
  it('starts at 0 x 0 with 3 cards per player', () => {
    const match = createMatch(config);
    expect(match.scores).toEqual([0, 0]);
    expect(match.handNumber).toBe(1);
    match.hand.hands.forEach((hand) => expect(hand).toHaveLength(3));
    expect([0, 1]).toContain(match.starterSeat);
    expect(match.hand.leadSeat).toBe(match.starterSeat);
  });

  it('same seed => same deal and same starter', () => {
    expect(createMatch(config)).toEqual(createMatch(config));
  });

  it('different seed => different deal', () => {
    expect(createMatch({ ...config, seed: 999 }).hand.hands).not.toEqual(createMatch(config).hand.hands);
  });
});

describe('scoring and next hand', () => {
  it('a finished hand adds its stake to the winner, and the next hand waits', () => {
    const start = createMatch(config);
    const winnerTeam = teamOf(start.starterSeat);
    const state = raiseAndRun(start);

    expect(state.scores[winnerTeam]).toBe(1);
    expect(state.hand.finished).toBe(true);
    expect(state.handNumber).toBe(1);
    expect(getMatchLegalActions(state)).toEqual([]);
  });

  it('startNextHand deals new cards and moves mão to the next seat', () => {
    const start = createMatch(config);
    const next = startNextHand(raiseAndRun(start));
    expect(next.handNumber).toBe(2);
    expect(next.starterSeat).toBe((start.starterSeat + 1) % 2);
    expect(next.hand.finished).toBe(false);
    expect(next.hand.hands).not.toEqual(start.hand.hands);
  });

  it('cannot start the next hand before the current one is over', () => {
    expect(() => startNextHand(createMatch(config))).toThrow();
  });

  it('reaching the target score ends the match', () => {
    const start = createMatch(config);
    const team = teamOf(start.starterSeat);
    const scores: [number, number] = team === 0 ? [11, 0] : [0, 11];
    const state = raiseAndRun({ ...start, scores });

    expect(state.finished).toBe(true);
    expect(state.winner).toBe(team);
    expect(getMatchLegalActions(state)).toEqual([]);
    expect(() => startNextHand(state)).toThrow();
  });

  it('getting to 11 makes the next hand a mão de 11', () => {
    const start = { ...createMatch(config), scores: [10, 10] as [number, number] };
    const team = teamOf(start.starterSeat);
    const next = startNextHand(raiseAndRun(start));
    expect(next.hand.mode).toEqual({ kind: 'eleven', team });
  });
});

describe('handModeFor', () => {
  it('normal when nobody is one point from winning', () => {
    expect(handModeFor([10, 5], 12)).toEqual({ kind: 'normal' });
    expect(handModeFor([11, 5], 24)).toEqual({ kind: 'normal' });
  });

  it('mão de 11 (or 23) for the team one point from winning', () => {
    expect(handModeFor([11, 5], 12)).toEqual({ kind: 'eleven', team: 0 });
    expect(handModeFor([5, 23], 24)).toEqual({ kind: 'eleven', team: 1 });
  });

  it('mão de ferro when both teams are one point from winning', () => {
    expect(handModeFor([11, 11], 12)).toEqual({ kind: 'iron' });
  });
});

/** Plays a whole match picking random legal actions (deterministic: seeded). */
function playRandomMatch(config: MatchConfig, choiceSeed: number): MatchState {
  const rng = createRng(choiceSeed);
  let state = createMatch(config);
  for (let steps = 0; !state.finished; steps++) {
    if (steps > 10_000) {
      throw new Error('Match did not end');
    }
    if (state.hand.finished) {
      state = startNextHand(state);
      continue;
    }
    const actions = getMatchLegalActions(state);
    state = applyMatchAction(state, actions[Math.floor(rng() * actions.length)]);
  }
  return state;
}

/** Rebuilds a match from its config (seed) and history alone. */
function replay(config: MatchConfig, history: readonly HistoryEntry[]): MatchState {
  let state = createMatch(config);
  for (const entry of history) {
    if (entry.handNumber !== state.handNumber) {
      state = startNextHand(state);
    }
    state = applyMatchAction(state, entry.action);
  }
  return state;
}

describe('history', () => {
  it('starts empty', () => {
    expect(createMatch(config).history).toEqual([]);
  });

  it('records each action with its hand number, across hands', () => {
    const state = raiseAndRun(startNextHand(raiseAndRun(createMatch(config))));
    expect(state.history.map((entry) => [entry.handNumber, entry.action.type])).toEqual([
      [1, 'raise'],
      [1, 'run'],
      [2, 'raise'],
      [2, 'run'],
    ]);
  });

  it('seed + history rebuild the exact same match (1x1)', () => {
    const played = playRandomMatch(config, 1);
    expect(played.finished).toBe(true);
    expect(replay(config, played.history)).toEqual(played);
  });

  it('seed + history rebuild the exact same match (2x2, to 24)', () => {
    const fourPlayers: MatchConfig = { playerCount: 4, targetScore: 24, seed: 77 };
    const played = playRandomMatch(fourPlayers, 2);
    expect(played.finished).toBe(true);
    expect(replay(fourPlayers, played.history)).toEqual(played);
  });
});

describe('signals in a match', () => {
  it('2x2 normal hands start with a signal round; 1x1 never does', () => {
    expect(createMatch({ playerCount: 4, targetScore: 12, seed: 3 }).hand.signalingSeat).not.toBeNull();
    expect(createMatch({ playerCount: 2, targetScore: 12, seed: 3 }).hand.signalingSeat).toBeNull();
  });

  it('partners always watch each other; who catches what depends only on the seed', () => {
    const fourPlayers: MatchConfig = { playerCount: 4, targetScore: 12, seed: 9 };
    const watchers = createMatch(fourPlayers).hand.signalWatchers;
    watchers.forEach((seen, seat) => expect(seen[0]).toBe((seat + 2) % 4));
    expect(createMatch(fourPlayers).hand.signalWatchers).toEqual(watchers);
  });

  it('rivals catch signals roughly 25% of the time', () => {
    let caught = 0;
    let chances = 0;
    for (let seed = 1; seed <= 500; seed++) {
      createMatch({ playerCount: 4, targetScore: 12, seed }).hand.signalWatchers.forEach((seen) => {
        caught += seen.length - 1;
        chances += 2;
      });
    }
    expect(caught / chances).toBeGreaterThan(0.2);
    expect(caught / chances).toBeLessThan(0.3);
  });
});
