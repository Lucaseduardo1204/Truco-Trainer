import { baselineBot, currentBot, runArena } from './testing';

// The arena: hundreds of seeded matches, each seed played twice with the teams swapped.
// Every bot improvement must show up here as a higher win rate against the frozen baseline.

describe('arena', () => {
  it('is fair: the baseline against itself wins about half', () => {
    for (const playerCount of [2, 4] as const) {
      const result = runArena(baselineBot, baselineBot, playerCount, 200);
      expect(result.winRateA).toBeGreaterThan(0.42);
      expect(result.winRateA).toBeLessThan(0.58);
    }
  });

  // Steps 2-5 (win chance, bet reading, situational bluff, score awareness, ties, deixa comigo):
  // to 12 points ~61% (1x1) / ~65% (2x2); to 24 ~69% / ~64%.
  it('the current bot clearly beats the baseline', () => {
    for (const playerCount of [2, 4] as const) {
      expect(runArena(currentBot, baselineBot, playerCount, 200).winRateA).toBeGreaterThan(0.55);
    }
  });
});
