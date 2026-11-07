import { playBotMatch } from '../bot/testing';
import { isSameCard } from '../engine/card';
import { applyAction, createHand, getLegalActions, HandAction, HandState } from '../engine/hand';
import { createMatch, MatchConfig, MatchState } from '../engine/match';
import { unseenCards } from '../engine/odds';
import { createRng } from '../engine/random';
import { c } from '../engine/testing';
import { getPlayerView } from '../engine/view';
import { extractDecisions } from '../feedback/decisions';
import { sampleHiddenHands, simulateOptions } from './simulate';

/** 1x1 match with these hands; `lead` opens. Optional actions applied first. */
function setup(mine: string[], rival: string[], lead: number, actions: HandAction[] = []): MatchState {
  const base = createMatch({ playerCount: 2, targetScore: 12, seed: 1 });
  const start = createHand(2, [mine.map(c), rival.map(c)], lead);
  const hand = actions.reduce((h: HandState, a) => applyAction(h, a), start);
  return { ...base, hand };
}

const play = (seat: number, card: string): HandAction => ({ type: 'playCard', seat, card: c(card) });

describe('sampleHiddenHands', () => {
  it('gives every other seat the right number of cards, all unseen and all different', () => {
    const match = setup(['3♣', '2♣', 'K♣'], ['Q♥', 'J♥', 'K♥'], 0, [play(0, 'K♣')]);
    const view = getPlayerView(match, 0);
    const hands = sampleHiddenHands(view, createRng(1));

    expect(hands[0]).toEqual(view.ownCards); // own cards kept
    expect(hands[1]).toHaveLength(3); // the rival hasn't played yet
    const unseen = unseenCards(view);
    hands[1].forEach((card) => expect(unseen.some((u) => isSameCard(u, card))).toBe(true));
    expect(new Set(hands[1].map((card) => card.rank + card.suit)).size).toBe(3);
  });
});

describe('simulateOptions', () => {
  it('a sure thing is 100%: last round, my 3 against the rival\'s Q on the table', () => {
    // Round 1: my 2♣ beats K♥. Round 2: rival's J♥ beats my Q♣. Round 3: rival plays Q♥, I hold 3♣.
    const match = setup(['2♣', 'Q♣', '3♣'], ['K♥', 'J♥', 'Q♥'], 0, [
      play(0, '2♣'),
      play(1, 'K♥'),
      play(0, 'Q♣'),
      play(1, 'J♥'),
      play(1, 'Q♥'),
    ]);
    const view = getPlayerView(match, 0);
    const result = simulateOptions(view, getLegalActions(match.hand), 50, 1);
    const card = result.options.find((o) => o.action.type === 'playCard')!;
    expect(card.winChance).toBe(1);
    expect(card.expectedPoints).toBe(1);
  });

  it('running is always a sure loss of the current value', () => {
    const match = setup(['Q♣', 'J♣', 'K♣'], ['3♥', '2♥', 'J♥'], 1, [{ type: 'raise', seat: 1 }]);
    const result = simulateOptions(getPlayerView(match, 0), getLegalActions(match.hand), 50, 1);
    const run = result.options.find((o) => o.action.type === 'run')!;
    expect(run.winChance).toBe(0);
    expect(run.expectedPoints).toBe(-1);
  });

  it('zap + copas + 3 wins almost always; small cards rarely (playing the cards out)', () => {
    const strong = setup(['4♣', '7♥', '3♣'], ['Q♥', 'J♥', 'K♥'], 0);
    const weak = setup(['Q♣', 'J♣', 'K♣'], ['3♥', '2♥', 'A♥'], 0);
    // Only card plays: asking for truco with a weak hand is a bluff, and bluffs can win.
    const bestCardPlay = (m: MatchState) =>
      Math.max(
        ...simulateOptions(getPlayerView(m, 0), getLegalActions(m.hand), 200, 1)
          .options.filter((o) => o.action.type === 'playCard')
          .map((o) => o.winChance),
      );
    expect(bestCardPlay(strong)).toBeGreaterThan(0.9);
    expect(bestCardPlay(weak)).toBeLessThan(0.3);
  });

  it('a bluff can be the best option: with Q J K, asking for truco loses less than playing quietly', () => {
    const weak = setup(['Q♣', 'J♣', 'K♣'], ['3♥', '2♥', 'A♥'], 0);
    const result = simulateOptions(getPlayerView(weak, 0), getLegalActions(weak.hand), 200, 1);
    expect(result.best?.type).toBe('raise');
  });

  it('is reproducible: same seed, same numbers', () => {
    const match = setup(['3♣', '2♣', 'K♣'], ['Q♥', 'J♥', 'K♥'], 0);
    const view = getPlayerView(match, 0);
    const legal = getLegalActions(match.hand);
    expect(simulateOptions(view, legal, 100, 9)).toEqual(simulateOptions(view, legal, 100, 9));
  });

  it('marks as best the option with the most expected points', () => {
    const match = setup(['Q♣', 'J♣', 'K♣'], ['3♥', '2♥', 'J♥'], 1, [{ type: 'raise', seat: 1 }]);
    const result = simulateOptions(getPlayerView(match, 0), getLegalActions(match.hand), 200, 1);
    const top = Math.max(...result.options.map((o) => o.expectedPoints));
    expect(result.options.find((o) => o.action === result.best)!.expectedPoints).toBe(top);
  });

  it('skips the signal round and options that are about talking, not playing', () => {
    const fourPlayers = createMatch({ playerCount: 4, targetScore: 12, seed: 3 });
    const view = getPlayerView(fourPlayers, fourPlayers.hand.signalingSeat!);
    expect(simulateOptions(view, getLegalActions(fourPlayers.hand), 10, 1).options).toEqual([]);
  });

  it('never breaks: every decision of whole bot matches (1x1 and 2x2) can be simulated', () => {
    for (const config of [
      { playerCount: 2, targetScore: 12, seed: 61 },
      { playerCount: 4, targetScore: 12, seed: 62 },
    ] as MatchConfig[]) {
      const match = playBotMatch(config);
      for (const decision of extractDecisions(config, match.history, 0)) {
        const result = simulateOptions(decision.view, decision.legal, 3, 1);
        result.options.forEach((o) => {
          expect(o.winChance).toBeGreaterThanOrEqual(0);
          expect(o.winChance).toBeLessThanOrEqual(1);
        });
      }
    }
  });
});
