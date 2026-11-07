import { playBotMatch } from '../bot/testing';
import { MatchConfig } from '../engine/match';
import { analyzeMatch } from '../feedback/report';
import { buildEvolution, countMistakes, EvolutionInput, MistakeCounts } from './evolution';

const NO_MISTAKES: MistakeCounts = { ranFromStrong: 0, acceptedWeak: 0, wastedManilha: 0, burnedBestCard: 0 };
const config: MatchConfig = { playerCount: 2, targetScore: 12, seed: 1 };

/** A saved match with just the numbers that matter here. Day `day` of November. */
function saved(day: number, quality: number, won: boolean, assisted = false): EvolutionInput {
  return {
    playedAt: `2026-11-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    config,
    seat: 0,
    history: [],
    assisted,
    summary: { won, quality, bluffAttempts: 0, bluffSuccesses: 0, mistakesByKind: NO_MISTAKES },
  };
}

describe('buildEvolution', () => {
  it('orders matches oldest first, whatever order they are stored in', () => {
    const points = buildEvolution([saved(3, 70, true), saved(1, 50, false), saved(2, 60, true)], { onlyUnassisted: false });
    expect(points.map((p) => p.quality)).toEqual([50, 60, 70]);
    expect(points.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it('quality trend is the average of the last 5 (fewer at the start)', () => {
    const qualities = [40, 60, 80, 100, 100, 100];
    const points = buildEvolution(qualities.map((q, i) => saved(i + 1, q, true)), { onlyUnassisted: false });
    expect(points.map((p) => p.qualityTrend)).toEqual([40, 50, 60, 70, 76, 88]);
  });

  it('recent win rate counts the last 10 matches', () => {
    const results = [true, false, true, true];
    const points = buildEvolution(results.map((won, i) => saved(i + 1, 50, won)), { onlyUnassisted: false });
    expect(points.map((p) => p.recentWinRate)).toEqual([100, 50, 67, 75]);
  });

  it('"só no seco" leaves out matches played with the statistics panel', () => {
    const all = [saved(1, 50, false), saved(2, 90, true, true), saved(3, 70, true)];
    const points = buildEvolution(all, { onlyUnassisted: true });
    expect(points.map((p) => p.quality)).toEqual([50, 70]);
    expect(points[1].qualityTrend).toBe(60);
  });

  it('matches saved before Phase 4 (no mistake counts) are analyzed by replay', () => {
    const played = playBotMatch(config);
    const old: EvolutionInput = {
      ...saved(1, 50, played.winner === 0),
      history: played.history,
      summary: { won: played.winner === 0, quality: 50, bluffAttempts: 0, bluffSuccesses: 0 },
    };
    const [point] = buildEvolution([old], { onlyUnassisted: false });
    expect(point.mistakes).toEqual(countMistakes(analyzeMatch(config, played.history, 0)));
  });

  it('no matches, no points', () => {
    expect(buildEvolution([], { onlyUnassisted: true })).toEqual([]);
  });
});
