import { TestBed } from '@angular/core/testing';
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
import { MAX_SAVED_MATCHES, MatchHistoryService, STORAGE_KEY } from './match-history.service';

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

const config: MatchConfig = { playerCount: 2, targetScore: 12, seed: 41 };
const played = playBotMatch(config);

describe('MatchHistoryService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts empty', () => {
    expect(TestBed.inject(MatchHistoryService).matches()).toEqual([]);
  });

  it('saves a finished match with its summary, newest first', () => {
    const service = TestBed.inject(MatchHistoryService);
    service.save(config, played.history, 0, new Date('2026-11-01T10:00:00Z'));
    const second = service.save(config, played.history, 0, new Date('2026-11-02T10:00:00Z'));

    expect(service.matches()).toHaveLength(2);
    expect(service.matches()[0]).toBe(second);
    expect(second.summary.myScore).toBe(played.scores[0]);
    expect(second.summary.won).toBe(played.winner === 0);
    expect(second.playedAt).toBe('2026-11-02T10:00:00.000Z');
  });

  it('survives a reload (reads back from localStorage)', () => {
    TestBed.inject(MatchHistoryService).save(config, played.history, 0);
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(MatchHistoryService);
    expect(reloaded.matches()).toHaveLength(1);
    expect(reloaded.matches()[0].history).toEqual(played.history);
  });

  it('keeps at most MAX_SAVED_MATCHES', () => {
    const service = TestBed.inject(MatchHistoryService);
    for (let i = 0; i < MAX_SAVED_MATCHES + 3; i++) {
      service.save(config, played.history, 0);
    }
    expect(service.matches()).toHaveLength(MAX_SAVED_MATCHES);
  });

  it('ignores corrupted storage instead of crashing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(TestBed.inject(MatchHistoryService).matches()).toEqual([]);
  });
});
