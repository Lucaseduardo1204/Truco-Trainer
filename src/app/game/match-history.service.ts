import { Injectable, signal } from '@angular/core';
import { HistoryEntry, MatchConfig } from '../engine/match';
import { analyzeMatch } from '../feedback/report';

/** Small numbers for lists and the evolution panel. The full report is rebuilt by replay. */
export interface MatchSummary {
  readonly won: boolean;
  readonly myScore: number;
  readonly theirScore: number;
  readonly handsPlayed: number;
  /** 0..100 */
  readonly quality: number;
  readonly bluffAttempts: number;
  readonly bluffSuccesses: number;
}

/** One finished match, as stored. Config (seed) + history is enough to replay it. */
export interface SavedMatch {
  readonly id: string;
  /** ISO date-time when it ended. */
  readonly playedAt: string;
  readonly config: MatchConfig;
  readonly seat: number;
  readonly history: readonly HistoryEntry[];
  readonly summary: MatchSummary;
}

/** Versioned key: if the format ever changes, old data is simply ignored. */
export const STORAGE_KEY = 'truco-trainer.matches.v1';

/** Oldest matches are dropped beyond this, to stay far from the browser's storage limit. */
export const MAX_SAVED_MATCHES = 200;

/**
 * Keeps finished matches in localStorage. The rest of the app reads `matches`
 * and never touches localStorage directly.
 */
@Injectable({ providedIn: 'root' })
export class MatchHistoryService {
  private readonly saved = signal<readonly SavedMatch[]>(readFromStorage());

  /** All saved matches, newest first. */
  readonly matches = this.saved.asReadonly();

  /** Analyzes a finished match, stores it and returns what was stored. */
  save(config: MatchConfig, history: readonly HistoryEntry[], seat: number, now = new Date()): SavedMatch {
    const report = analyzeMatch(config, history, seat);
    const match: SavedMatch = {
      id: `${now.getTime()}-${config.seed}`,
      playedAt: now.toISOString(),
      config,
      seat,
      history,
      summary: {
        won: report.won,
        myScore: report.myScore,
        theirScore: report.theirScore,
        handsPlayed: report.handsPlayed,
        quality: report.quality,
        bluffAttempts: report.bluffs.attempts,
        bluffSuccesses: report.bluffs.successes,
      },
    };
    const all = [match, ...this.saved()].slice(0, MAX_SAVED_MATCHES);
    this.saved.set(all);
    writeToStorage(all);
    return match;
  }
}

/** Never throws: private windows, blocked storage or corrupted data just mean "no history". */
function readFromStorage(): SavedMatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedMatch[]) : [];
  } catch {
    return [];
  }
}

function writeToStorage(matches: readonly SavedMatch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matches));
  } catch {
    // Storage full or blocked: the history still works for this session, in memory.
  }
}
