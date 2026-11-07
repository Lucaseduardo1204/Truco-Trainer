import { Component, computed, input, signal } from '@angular/core';
import { tooltipAlignAt } from './line-chart';

export interface BarCategory {
  readonly name: string;
  /** A CSS color, e.g. 'var(--series-1)'. */
  readonly color: string;
}

/** One painted piece of a bar. */
interface Segment {
  readonly color: string;
  /** SVG path: a rect, with rounded top corners when it's the top of the bar. */
  readonly d: string;
}

const WIDTH = 600;
const HEIGHT = 170;
const MARGIN = { top: 10, right: 14, bottom: 24, left: 34 };

/** Gap in the surface color between stacked segments (the spacer that separates them). */
const GAP = 2;
const MAX_BAR = 24;
const RADIUS = 4;

/**
 * Stacked columns in plain SVG: one column per match, one segment per category (fixed order),
 * 2px surface gaps between segments, 4px rounded top, square at the baseline.
 * Each column is a focusable hit area with a tooltip listing every category.
 */
@Component({
  selector: 'app-stacked-bar-chart',
  templateUrl: './stacked-bar-chart.html',
  styleUrl: './stacked-bar-chart.scss',
})
export class StackedBarChart {
  readonly categories = input.required<readonly BarCategory[]>();
  /** rows[match][category] = value. */
  readonly rows = input.required<readonly (readonly number[])[]>();
  /** One label per match: "Partida 3 · 06/11". */
  readonly labels = input.required<readonly string[]>();
  readonly ariaLabel = input.required<string>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly hovered = signal<number | null>(null);

  protected readonly count = computed(() => this.rows().length);
  protected readonly slot = computed(() => (WIDTH - MARGIN.left - MARGIN.right) / Math.max(1, this.count()));
  protected readonly barWidth = computed(() => Math.min(MAX_BAR, this.slot() * 0.6));

  /** Top of the y axis: the biggest column, at least 1. */
  protected readonly yMax = computed(() => Math.max(1, ...this.rows().map((row) => sum(row))));

  protected readonly yTicks = computed(() => [0, this.yMax()]);

  /** Every column, as painted segments. */
  protected readonly bars = computed((): Segment[][] =>
    this.rows().map((row, i) => this.segments(row, i)),
  );

  protected x(index: number): number {
    return MARGIN.left + index * this.slot() + this.slot() / 2;
  }

  protected y(value: number): number {
    return MARGIN.top + (1 - value / this.yMax()) * (HEIGHT - MARGIN.top - MARGIN.bottom);
  }

  protected total(index: number): number {
    return sum(this.rows()[index]);
  }

  protected tooltipLeft(index: number): number {
    return (this.x(index) / WIDTH) * 100;
  }

  /** Near the edges, align the tooltip to that edge so it never spills out of the card. */
  protected tooltipAlign(index: number): 'start' | 'center' | 'end' {
    return tooltipAlignAt(this.tooltipLeft(index));
  }

  private segments(row: readonly number[], index: number): Segment[] {
    const left = this.x(index) - this.barWidth() / 2;
    const lastNonZero = row.reduce((last, value, c) => (value > 0 ? c : last), -1);
    const segments: Segment[] = [];
    let bottom = 0;
    row.forEach((value, c) => {
      if (value <= 0) {
        return;
      }
      const yBottom = this.y(bottom);
      // Leave the surface gap above every segment except the top one.
      const yTop = this.y(bottom + value) + (c === lastNonZero ? 0 : GAP);
      const height = Math.max(0, yBottom - yTop);
      const radius = c === lastNonZero ? Math.min(RADIUS, height, this.barWidth() / 2) : 0;
      segments.push({ color: this.categories()[c].color, d: roundedTop(left, yTop, this.barWidth(), height, radius) });
      bottom += value;
    });
    return segments;
  }
}

/** A rect whose top corners are rounded by `r` (bottom stays square on the baseline). */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + w - r} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + r}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
