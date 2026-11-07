import { isSameCard } from '../engine/card';
import { HandAction } from '../engine/hand';
import {
  applyMatchAction,
  createMatch,
  getMatchLegalActions,
  MatchConfig,
  MatchState,
  startNextHand,
} from '../engine/match';
import { createRng } from '../engine/random';
import { extractDecisions } from './decisions';

/** Plays a whole match picking random legal actions (deterministic: seeded). */
function playRandomMatch(config: MatchConfig, choiceSeed: number): MatchState {
  const rng = createRng(choiceSeed);
  let state = createMatch(config);
  while (!state.finished) {
    if (state.hand.finished) {
      state = startNextHand(state);
      continue;
    }
    const actions = getMatchLegalActions(state);
    state = applyMatchAction(state, actions[Math.floor(rng() * actions.length)]);
  }
  return state;
}

function sameAction(a: HandAction, b: HandAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

describe('extractDecisions', () => {
  const oneVsOne: MatchConfig = { playerCount: 2, targetScore: 12, seed: 21 };
  const played = playRandomMatch(oneVsOne, 4);
  const decisions = extractDecisions(oneVsOne, played.history, 0);

  it('returns exactly the analyzed seat actions, in order', () => {
    const mine = played.history.filter((entry) => entry.action.seat === 0);
    expect(decisions.map((d) => d.action)).toEqual(mine.map((entry) => entry.action));
    expect(decisions.map((d) => d.handNumber)).toEqual(mine.map((entry) => entry.handNumber));
  });

  it('each chosen action was one of the legal options at that moment', () => {
    decisions.forEach((d) => expect(d.legal.some((option) => sameAction(option, d.action))).toBe(true));
  });

  it('the view is from right before the decision', () => {
    // A played card was still in the hand when the player chose it.
    decisions
      .filter((d) => d.action.type === 'playCard')
      .forEach((d) => {
        const card = d.action.type === 'playCard' ? d.action.card : null;
        expect(d.view.ownCards.some((c) => isSameCard(c, card!))).toBe(true);
      });
  });

  it('the view never shows the other player cards, but the revealed hands do', () => {
    const first = decisions[0];
    expect(first.revealedHands[0]).toEqual(first.view.ownCards);
    expect(first.revealedHands[1]).toHaveLength(3);
    expect(JSON.stringify(first.view)).not.toContain(JSON.stringify(first.revealedHands[1]));
  });

  it('works for 2x2 (including the signal round)', () => {
    const twoVsTwo: MatchConfig = { playerCount: 4, targetScore: 12, seed: 8 };
    const match = playRandomMatch(twoVsTwo, 6);
    const mine = extractDecisions(twoVsTwo, match.history, 0);
    expect(mine.length).toBe(match.history.filter((entry) => entry.action.seat === 0).length);
    expect(mine.some((d) => d.action.type === 'signal')).toBe(true);
  });

  it('rejects a history that does not belong to the config', () => {
    expect(() => extractDecisions({ ...oneVsOne, seed: 999 }, played.history, 0)).toThrow();
  });
});
