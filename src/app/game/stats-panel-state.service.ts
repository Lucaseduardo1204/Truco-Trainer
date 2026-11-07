import { Injectable, signal } from '@angular/core';

/** Remembered in the browser: whether the human wants the panel. A convenience, not game data. */
export const STATS_PANEL_KEY = 'truco-trainer.stats-panel';

/**
 * Whether the live statistics panel (📊) is on. Its own tiny service so that both the panel
 * (LiveStatsService) and the game (GameService, to mark matches played with help) can read it
 * without depending on each other.
 */
@Injectable({ providedIn: 'root' })
export class StatsPanelState {
  private readonly enabledState = signal(readPreference());

  readonly enabled = this.enabledState.asReadonly();

  toggle(): void {
    const enabled = !this.enabledState();
    this.enabledState.set(enabled);
    try {
      localStorage.setItem(STATS_PANEL_KEY, enabled ? 'on' : 'off');
    } catch {
      // Blocked storage: the panel still works for this session.
    }
  }
}

function readPreference(): boolean {
  try {
    return localStorage.getItem(STATS_PANEL_KEY) === 'on';
  } catch {
    return false;
  }
}
