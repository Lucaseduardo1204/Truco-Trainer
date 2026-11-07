import { computed, inject, Injectable } from '@angular/core';
import { RECOMMENDED_SAMPLES, simulateOptions, SimulationResult } from '../stats/simulate';
import { GameService } from './game.service';
import { StatsPanelState } from './stats-panel-state.service';

export { STATS_PANEL_KEY } from './stats-panel-state.service';

/**
 * The live statistics panel: when switched on, simulates the human's options every time it's
 * their turn. Switched off, nothing is simulated at all.
 */
@Injectable({ providedIn: 'root' })
export class LiveStatsService {
  private readonly game = inject(GameService);
  private readonly panel = inject(StatsPanelState);

  readonly enabled = this.panel.enabled;

  /**
   * The human's options right now, simulated. null when the panel is off or it isn't their turn.
   * A computed only recalculates when something it reads changes (and someone reads it),
   * so each decision is simulated once.
   */
  readonly result = computed((): SimulationResult | null => {
    if (!this.enabled()) {
      return null;
    }
    const match = this.game.match();
    const view = this.game.view();
    const legal = this.game.myActions();
    if (!match || !view || legal.length === 0) {
      return null;
    }
    // Seeded by the match and the moment: the same situation always shows the same numbers.
    const seed = match.config.seed + match.history.length;
    const result = simulateOptions(view, legal, RECOMMENDED_SAMPLES[view.playerCount], seed);
    return result.options.length > 0 ? result : null;
  });

  toggle(): void {
    this.panel.toggle();
  }
}
