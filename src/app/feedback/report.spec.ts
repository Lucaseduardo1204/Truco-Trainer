import { chooseAction, DEFAULT_BOT } from '../bot/bot';
import {
  applyMatchAction,
  createMatch,
  getMatchLegalActions,
  MatchConfig,
  MatchState,
  startNextHand,
} from '../engine/match';
import { createRng } from '../engine/random';
import { getPlayerView } from '../engine/view';
import { analyzeMatch } from './report';

/** Whole match where every seat is a bot (the "human" seat 0 too). */
function playBotMatch(config: MatchConfig): MatchState {
  const rng = createRng(config.seed);
  let state = createMatch(config);
  while (!state.finished) {
    if (state.hand.finished) {
      state = startNextHand(state);
      continue;
    }
    const legal = getMatchLegalActions(state);
    state = applyMatchAction(state, chooseAction(getPlayerView(state, legal[0].seat), legal, DEFAULT_BOT, rng));
  }
  return state;
}

describe('analyzeMatch', () => {
  for (const config of [
    { playerCount: 2, targetScore: 12, seed: 31 },
    { playerCount: 4, targetScore: 12, seed: 32 },
  ] as MatchConfig[]) {
    it(`gives a consistent report (${config.playerCount === 2 ? '1x1' : '2x2'})`, () => {
      const match = playBotMatch(config);
      const report = analyzeMatch(config, match.history, 0);

      expect(report.won).toBe(match.winner === 0);
      expect(report.myScore).toBe(match.scores[0]);
      expect(report.theirScore).toBe(match.scores[1]);
      expect(report.handsPlayed).toBe(match.handNumber);
      expect(report.mistakes).toBeLessThanOrEqual(report.judgedDecisions);
      expect(report.quality).toBeGreaterThanOrEqual(0);
      expect(report.quality).toBeLessThanOrEqual(100);
      expect(report.bluffs.successes).toBeLessThanOrEqual(report.bluffs.attempts);

      // Moments come in the order they happened.
      const order = report.moments.map((m) => m.finding.decision.historyIndex);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });
  }

  it('reveals the rivals cards in each moment (2x2: 2 rivals, up to 6 cards)', () => {
    const config: MatchConfig = { playerCount: 4, targetScore: 12, seed: 32 };
    const report = analyzeMatch(config, playBotMatch(config).history, 0);
    report.moments.forEach((moment) => expect(moment.rivalCards.length).toBeLessThanOrEqual(6));
  });
});
