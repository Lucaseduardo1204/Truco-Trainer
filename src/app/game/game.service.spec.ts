import { TestBed } from '@angular/core/testing';
import { createMatch } from '../engine/match';
import { BOT_DELAY_MS, GameService, HUMAN_SEAT, MatchOptions } from './game.service';
import { MatchHistoryService } from './match-history.service';

const ONE_VS_ONE: MatchOptions = { targetScore: 12, playerCount: 2 };

/** First seed whose first hand is started by `seat`. */
function seedWhereStarterIs(seat: number): number {
  let seed = 1;
  while (createMatch({ playerCount: 2, targetScore: 12, seed }).starterSeat !== seat) {
    seed++;
  }
  return seed;
}

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    service = TestBed.inject(GameService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('has no match before startMatch', () => {
    expect(service.match()).toBeNull();
    expect(service.myActions()).toEqual([]);
  });

  it('human to act: actions available, bot waits', () => {
    service.startMatch(ONE_VS_ONE, seedWhereStarterIs(HUMAN_SEAT));
    expect(service.myActions().length).toBeGreaterThan(0);
    expect(service.botToAct()).toBe(false);
  });

  it('bot to act: it plays only after the delay', () => {
    service.startMatch(ONE_VS_ONE, seedWhereStarterIs(1));
    expect(service.botToAct()).toBe(true);
    expect(service.myActions()).toEqual([]);

    vi.advanceTimersByTime(BOT_DELAY_MS - 1);
    expect(service.match()!.history).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(service.match()!.history).toHaveLength(1);
  });

  it('after the human plays a card, the bot answers', () => {
    service.startMatch(ONE_VS_ONE, seedWhereStarterIs(HUMAN_SEAT));
    const play = service.myActions().find((action) => action.type === 'playCard')!;
    service.act(play);

    expect(service.botToAct()).toBe(true);
    vi.advanceTimersByTime(BOT_DELAY_MS);
    expect(service.match()!.history.map((entry) => entry.action.seat)).toEqual([0, 1]);
  });

  it('refuses actions for the bot seat', () => {
    service.startMatch(ONE_VS_ONE, seedWhereStarterIs(1));
    expect(() => service.act({ type: 'run', seat: 1 })).toThrow();
  });

  it('starting a new match cancels a pending bot move', () => {
    service.startMatch(ONE_VS_ONE, seedWhereStarterIs(1));
    service.startMatch(ONE_VS_ONE, seedWhereStarterIs(HUMAN_SEAT));
    vi.advanceTimersByTime(BOT_DELAY_MS);
    expect(service.match()!.history).toHaveLength(0);
  });

  it.each([
    ['1x1', ONE_VS_ONE],
    ['2x2', { targetScore: 12, playerCount: 4 } as MatchOptions],
  ])('a whole %s match can be played to the end', (_, options) => {
    service.startMatch(options, 42);
    for (let steps = 0; !service.match()!.finished; steps++) {
      if (steps > 10_000) {
        throw new Error('Match did not end');
      }
      if (service.match()!.hand.finished) {
        service.nextHand();
      } else if (service.myActions().length > 0) {
        // Always play the first card offered (never bet), just to move the match on.
        const actions = service.myActions();
        service.act(actions.find((action) => action.type === 'playCard') ?? actions[0]);
      } else {
        vi.advanceTimersByTime(BOT_DELAY_MS);
      }
    }
    expect(service.match()!.winner).not.toBeNull();

    // Saved exactly once, with the final score.
    const saved = TestBed.inject(MatchHistoryService).matches();
    expect(saved).toHaveLength(1);
    expect(service.lastSaved()).toBe(saved[0]);
    expect(saved[0].summary.myScore).toBe(service.match()!.scores[0]);
  });
});
