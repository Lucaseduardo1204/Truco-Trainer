import { DOCUMENT } from '@angular/common';
import { Component, computed, ElementRef, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FindingKind } from '../../feedback/detectors';
import { analyzeMatch, KeyMoment } from '../../feedback/report';
import { MatchHistoryService } from '../../game/match-history.service';
import { PlayingCard } from '../playing-card/playing-card';

interface KindInfo {
  readonly icon: string;
  readonly title: string;
}

const KINDS: Record<FindingKind, KindInfo> = {
  ranFromStrong: { icon: '🏃', title: 'Correu de mão forte' },
  acceptedWeak: { icon: '🎲', title: 'Aceitou com mão fraca' },
  bluff: { icon: '🃏', title: 'Blefe' },
  wastedManilha: { icon: '💸', title: 'Desperdiçou manilha' },
  burnedBestCard: { icon: '🔥', title: 'Queimou a manilha cedo' },
};

/** Post-match analysis of one saved match. Rebuilt by replay from its seed + history. */
@Component({
  selector: 'app-report',
  imports: [PlayingCard, RouterLink],
  templateUrl: './report.html',
  styleUrl: './report.scss',
})
export class Report {
  /** From the route `/relatorio/:id` (withComponentInputBinding). */
  readonly id = input.required<string>();

  private readonly history = inject(MatchHistoryService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  protected readonly saved = computed(() => this.history.matches().find((m) => m.id === this.id()) ?? null);

  protected readonly report = computed(() => {
    const saved = this.saved();
    return saved ? analyzeMatch(saved.config, saved.history, saved.seat) : null;
  });

  protected readonly formatLabel = computed(() => (this.saved()?.config.playerCount === 4 ? '2 x 2' : '1 x 1'));

  protected kind(moment: KeyMoment): KindInfo {
    return KINDS[moment.finding.kind];
  }

  /** Tone of the quality score: green from 80, amber from 50, pink below. */
  protected qualityTone(quality: number): 'good' | 'ok' | 'bad' {
    return quality >= 80 ? 'good' : quality >= 50 ? 'ok' : 'bad';
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  /**
   * Opens the browser's print dialog, where "Save as PDF" gives the file.
   * Before printing: every "Ver as cartas" is opened, and the page title becomes the file name.
   */
  protected downloadPdf(): void {
    const saved = this.saved();
    if (!saved) {
      return;
    }
    const details = Array.from(this.host.nativeElement.querySelectorAll('details'));
    const wasOpen = details.map((d) => d.open);
    details.forEach((d) => (d.open = true));

    const title = this.document.title;
    const day = saved.playedAt.slice(0, 10);
    this.document.title = `truco-trainer-analise-${day}`;

    window.print(); // blocks until the dialog closes

    this.document.title = title;
    details.forEach((d, i) => (d.open = wasOpen[i]));
  }
}
