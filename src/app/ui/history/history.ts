import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatchHistoryService } from '../../game/match-history.service';

/** List of saved matches, with overall numbers on top. Charts come in Phase 4. */
@Component({
  selector: 'app-history',
  imports: [RouterLink],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History {
  protected readonly matches = inject(MatchHistoryService).matches;

  protected readonly totals = computed(() => {
    const matches = this.matches();
    const wins = matches.filter((m) => m.summary.won).length;
    const bluffAttempts = matches.reduce((sum, m) => sum + m.summary.bluffAttempts, 0);
    const bluffSuccesses = matches.reduce((sum, m) => sum + m.summary.bluffSuccesses, 0);
    const qualitySum = matches.reduce((sum, m) => sum + m.summary.quality, 0);
    return {
      played: matches.length,
      winRate: percent(wins, matches.length),
      averageQuality: matches.length === 0 ? null : Math.round(qualitySum / matches.length),
      bluffRate: percent(bluffSuccesses, bluffAttempts),
      bluffAttempts,
    };
  });

  protected date(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
}

/** Rounded percentage, or null when there is nothing to divide. */
function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((100 * part) / whole);
}
