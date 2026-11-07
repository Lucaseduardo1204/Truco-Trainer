import { Component, computed, input } from '@angular/core';
import { Card, isManilha, Suit } from '../../engine/card';

const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '♣',
  hearts: '♥',
  spades: '♠',
  diamonds: '♦',
};

/** Display names of the fixed manilhas, keyed by "rank+suit". */
const MANILHA_NAMES: Record<string, string> = {
  '4clubs': 'Zap',
  '7hearts': 'Copas',
  'Aspades': 'Espadão',
  '7diamonds': 'Pica-fumo',
};

/** Draws one card (or its back). Display only: knows nothing about the game. */
@Component({
  selector: 'app-playing-card',
  templateUrl: './playing-card.html',
  styleUrl: './playing-card.scss',
})
export class PlayingCard {
  /** null = show the back. */
  readonly card = input<Card | null>(null);

  protected readonly symbol = computed(() => {
    const card = this.card();
    return card ? SUIT_SYMBOL[card.suit] : '';
  });

  protected readonly red = computed(() => {
    const suit = this.card()?.suit;
    return suit === 'hearts' || suit === 'diamonds';
  });

  /** "Zap", "Copas"... for manilhas; empty for common cards. */
  protected readonly manilhaName = computed(() => {
    const card = this.card();
    return card && isManilha(card) ? MANILHA_NAMES[card.rank + card.suit] : '';
  });
}
