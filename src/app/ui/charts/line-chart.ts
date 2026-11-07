import { Component, computed, input, signal } from '@angular/core';

/** One series: a 2px line, or dots (for raw per-match values under a trend line). */
export interface LineSeries {
  readonly name: string;
  /** A CSS color, e.g. 'var(--series-1)'. */
  readonly color: string;
  readonly style: 'line' | 'dots';
  readonly values: readonly number[];
}

/** Tooltip alignment for a position given as % of the chart width. Shared by the charts. */
export function tooltipAlignAt(leftPercent: number): 'start' | 'center' | 'end' {
  if (leftPercent < 25) {
    return 'start';
  }
  return leftPercent > 75 ? 'end' : 'center';
}

// Drawing area, in SVG units (the SVG scales to its container's width).
const WIDTH = 600;
const HEIGHT = 190;
const MARGIN = { top: 12, right: 14, bottom: 24, left: 34 };

/**
 * A small line chart drawn in plain SVG: hairline grid, 2px lines, dots with a surface ring,
 * a crosshair that snaps to the nearest match, and one tooltip listing every series there.
 * Keyboard: each match column is focusable and shows the same tooltip.
 */
@Component({
  selector: 'app-line-chart',
  templateUrl: './line-chart.html',
  styleUrl: './line-chart.scss',
})
export class LineChart {
  readonly series = input.required<readonly LineSeries[]>();
  /** One label per point, for the tooltip and the x axis: "Partida 3 · 06/11". */
  readonly labels = input.required<readonly string[]>();
  readonly yMax = input(100);
  /** Unit after each value in the tooltip and the y axis ("%" or ""). */
  readonly unit = input('');
  /** Accessible name of the whole chart. */
  readonly ariaLabel = input.required<string>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly hovered = signal<number | null>(null);

  protected readonly count = computed(() => this.labels().length);

  /** Horizontal gap between two matches. */
  protected readonly step = computed(() => (WIDTH - MARGIN.left - MARGIN.right) / Math.max(1, this.count() - 1));

  protected readonly yTicks = computed(() => [0, this.yMax() / 2, this.yMax()]);

  protected x(index: number): number {
    return MARGIN.left + index * this.step();
  }

  protected y(value: number): number {
    return MARGIN.top + (1 - value / this.yMax()) * (HEIGHT - MARGIN.top - MARGIN.bottom);
  }

  /** "M x0 y0 L x1 y1 ..." through every value of a series. */
  protected path(values: readonly number[]): string {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${this.x(i)} ${this.y(v)}`).join(' ');
  }

  /** Tooltip position, as a % of the chart width (the tooltip is HTML over the SVG). */
  protected tooltipLeft(index: number): number {
    return (this.x(index) / WIDTH) * 100;
  }

  /** Near the edges, align the tooltip to that edge so it never spills out of the card. */
  protected tooltipAlign(index: number): 'start' | 'center' | 'end' {
    return tooltipAlignAt(this.tooltipLeft(index));
  }

  protected format(value: number): string {
    return `${Math.round(value)}${this.unit()}`;
  }
}
