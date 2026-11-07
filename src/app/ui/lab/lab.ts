import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Card, createDeck, isSameCard, PlayerCount, Suit } from '../../engine/card';
import { Stake } from '../../engine/hand';
import { TargetScore } from '../../engine/match';
import { buildScenario, Scenario } from '../../stats/scenario';
import { RECOMMENDED_SAMPLES, simulateOptions } from '../../stats/simulate';
import { optionLabel } from '../option-label';
import { PlayingCard } from '../playing-card/playing-card';

type Pile = 'mine' | 'table';
type Bet = Exclude<Stake, 1>;

const SUIT_SYMBOLS: Record<Suit, string> = { clubs: '♣', hearts: '♥', spades: '♠', diamonds: '♦' };

/**
 * The lab: set up a first-round situation and see how each option does.
 * Only builds a Scenario and shows the simulator's numbers: no game rules here.
 */
@Component({
  selector: 'app-lab',
  imports: [PlayingCard, RouterLink],
  templateUrl: './lab.html',
  styleUrl: './lab.scss',
})
export class Lab {
  protected readonly deck = createDeck();
  protected readonly bets: readonly { value: Bet | null; label: string }[] = [
    { value: null, label: 'Nada' },
    { value: 3, label: 'Truco' },
    { value: 6, label: 'Seis' },
    { value: 9, label: 'Nove' },
    { value: 12, label: 'Doze' },
  ];

  protected readonly playerCount = signal<PlayerCount>(2);
  protected readonly target = signal<TargetScore>(12);
  protected readonly myScore = signal(0);
  protected readonly theirScore = signal(0);
  protected readonly myCards = signal<readonly Card[]>([]);
  protected readonly tableCards = signal<readonly Card[]>([]);
  protected readonly betAsked = signal<Bet | null>(null);
  /** Which pile a tap on the deck adds to. */
  protected readonly picking = signal<Pile>('mine');

  /** "Você abre a rodada", "Você é o 3º a jogar"... */
  protected readonly positionText = computed(() => {
    const before = this.tableCards().length + (this.betAsked() !== null ? 1 : 0);
    return before === 0 ? 'Você abre a rodada' : `Você é o ${before + 1}º a jogar`;
  });

  /** The situation as the engine sees it (or what's wrong with it). */
  protected readonly scenario = computed(() =>
    buildScenario({
      playerCount: this.playerCount(),
      targetScore: this.target(),
      scores: [this.myScore(), this.theirScore()],
      myCards: this.myCards(),
      tableCards: this.tableCards(),
      betAsked: this.betAsked(),
    } satisfies Scenario),
  );

  /** One row per option. Recomputed (~0.1 s) whenever the situation changes. */
  protected readonly rows = computed(() => {
    const scenario = this.scenario();
    if (!scenario.ok) {
      return null;
    }
    const result = simulateOptions(scenario.view, scenario.legal, RECOMMENDED_SAMPLES[this.playerCount()], 1);
    return result.options.map((option) => ({
      label: optionLabel(option.action, scenario.view),
      winPercent: Math.round(option.winChance * 100),
      points: (option.expectedPoints >= 0 ? '+' : '') + option.expectedPoints.toFixed(2),
      best: option.action === result.best,
    }));
  });

  protected pileOf(card: Card): Pile | null {
    if (this.myCards().some((c) => isSameCard(c, card))) {
      return 'mine';
    }
    return this.tableCards().some((c) => isSameCard(c, card)) ? 'table' : null;
  }

  /** Tapping a card: adds it to the pile being picked, or takes it out of wherever it is. */
  protected toggle(card: Card): void {
    const current = this.pileOf(card);
    if (current) {
      this.pile(current).update((cards) => cards.filter((c) => !isSameCard(c, card)));
      return;
    }
    const pile = this.picking();
    const max = pile === 'mine' ? 3 : this.playerCount() - 1;
    if (this.pile(pile)().length < max) {
      this.pile(pile).update((cards) => [...cards, card]);
    }
  }

  protected setPlayerCount(count: PlayerCount): void {
    this.playerCount.set(count);
    this.tableCards.set([]); // the number of seats before you changes
  }

  protected setTarget(target: TargetScore): void {
    this.target.set(target);
    this.myScore.update((s) => Math.min(s, target - 1));
    this.theirScore.update((s) => Math.min(s, target - 1));
  }

  protected score(value: string): number {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  protected cardText(card: Card): string {
    return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
  }

  protected isRed(card: Card): boolean {
    return card.suit === 'hearts' || card.suit === 'diamonds';
  }

  private pile(pile: Pile) {
    return pile === 'mine' ? this.myCards : this.tableCards;
  }
}
