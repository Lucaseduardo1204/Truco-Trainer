import { TestBed } from '@angular/core/testing';
import { createMatch } from '../engine/match';
import { BOT_DELAY_MS, GameService, HUMAN_SEAT } from './game.service';
import { LiveStatsService, STATS_PANEL_KEY } from './live-stats.service';

/** First seed whose first 1x1 hand is started by `seat`. */
function seedWhereStarterIs(seat: number): number {
  let seed = 1;
  while (createMatch({ playerCount: 2, targetScore: 12, seed }).starterSeat !== seat) {
    seed++;
  }
  return seed;
}

describe('LiveStatsService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is off by default, and simulates nothing while off', () => {
    TestBed.inject(GameService).startMatch({ targetScore: 12, playerCount: 2 }, seedWhereStarterIs(HUMAN_SEAT));
    const stats = TestBed.inject(LiveStatsService);
    expect(stats.enabled()).toBe(false);
    expect(stats.result()).toBeNull();
  });

  it('on the human turn, shows one entry per option (cards + truco)', () => {
    const game = TestBed.inject(GameService);
    game.startMatch({ targetScore: 12, playerCount: 2 }, seedWhereStarterIs(HUMAN_SEAT));
    const stats = TestBed.inject(LiveStatsService);
    stats.toggle();

    const result = stats.result()!;
    expect(result.options.map((o) => o.action.type).sort()).toEqual(['playCard', 'playCard', 'playCard', 'raise']);
    expect(result.best).not.toBeNull();
  });

  it('shows nothing while a bot is about to play', () => {
    const game = TestBed.inject(GameService);
    game.startMatch({ targetScore: 12, playerCount: 2 }, seedWhereStarterIs(1));
    const stats = TestBed.inject(LiveStatsService);
    stats.toggle();
    expect(stats.result()).toBeNull();

    vi.advanceTimersByTime(BOT_DELAY_MS); // the bot plays: now it's the human's turn
    expect(stats.result()).not.toBeNull();
  });

  it('remembers the choice in the browser', () => {
    TestBed.inject(LiveStatsService).toggle();
    expect(localStorage.getItem(STATS_PANEL_KEY)).toBe('on');

    TestBed.resetTestingModule();
    expect(TestBed.inject(LiveStatsService).enabled()).toBe(true);
  });
});
