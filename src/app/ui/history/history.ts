import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { buildEvolution, MISTAKE_KINDS, MistakeKind } from '../../evolution/evolution';
import { MatchHistoryService } from '../../game/match-history.service';
import { BarCategory, StackedBarChart } from '../charts/stacked-bar-chart';
import { LineChart, LineSeries } from '../charts/line-chart';

/** Names and colors of the mistake kinds, in the fixed series order. */
const MISTAKE_CATEGORIES: Record<MistakeKind, BarCategory> = {
  ranFromStrong: { name: 'Correu de mão forte', color: 'var(--series-1)' },
  acceptedWeak: { name: 'Aceitou com mão fraca', color: 'var(--series-2)' },
  wastedManilha: { name: 'Desperdiçou manilha', color: 'var(--series-3)' },
  burnedBestCard: { name: 'Manilha cedo', color: 'var(--series-4)' },
};

const BLUFF_CATEGORIES: readonly BarCategory[] = [
  { name: 'Colou', color: 'var(--series-1)' },
  { name: 'Não colou', color: 'var(--series-4)' },
];

/** The evolution dashboard: one filter on top, then totals, charts, a table and the match list. */
@Component({
  selector: 'app-history',
  imports: [RouterLink, LineChart, StackedBarChart],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History {
  private readonly allMatches = inject(MatchHistoryService).matches;

  /** "Só no seco": leave out matches played with the 📊 panel. */
  protected readonly onlyUnassisted = signal(false);

  /** The matches the filter keeps, newest first (for the list). */
  protected readonly matches = computed(() =>
    this.allMatches().filter((match) => !this.onlyUnassisted() || !match.assisted),
  );

  protected readonly assistedCount = computed(() => this.allMatches().filter((m) => m.assisted).length);

  /** Evolution points, oldest first (for the charts and the table). */
  protected readonly points = computed(() =>
    buildEvolution(this.allMatches(), { onlyUnassisted: this.onlyUnassisted() }),
  );

  protected readonly labels = computed(() => this.points().map((p) => `Partida ${p.index} · ${this.shortDate(p.playedAt)}`));

  protected readonly qualitySeries = computed((): LineSeries[] => [
    { name: 'Nota da partida', color: 'var(--series-4)', style: 'dots', values: this.points().map((p) => p.quality) },
    { name: 'Tendência (média de 5)', color: 'var(--series-1)', style: 'line', values: this.points().map((p) => p.qualityTrend) },
  ]);

  protected readonly winRateSeries = computed((): LineSeries[] => [
    { name: 'Win rate', color: 'var(--series-1)', style: 'line', values: this.points().map((p) => p.recentWinRate) },
  ]);

  protected readonly mistakeCategories = MISTAKE_KINDS.map((kind) => MISTAKE_CATEGORIES[kind]);
  protected readonly mistakeRows = computed(() => this.points().map((p) => MISTAKE_KINDS.map((kind) => p.mistakes[kind])));

  protected readonly bluffCategories = BLUFF_CATEGORIES;
  protected readonly bluffRows = computed(() =>
    this.points().map((p) => [p.bluffSuccesses, p.bluffAttempts - p.bluffSuccesses]),
  );

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

  protected mistakeName(kind: MistakeKind): string {
    return MISTAKE_CATEGORIES[kind].name;
  }

  protected readonly mistakeKinds = MISTAKE_KINDS;

  protected date(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  private shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
}

/** Rounded percentage, or null when there is nothing to divide. */
function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((100 * part) / whole);
}
