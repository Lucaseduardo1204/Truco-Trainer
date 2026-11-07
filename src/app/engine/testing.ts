// Helpers for spec files only. Not used by the app.

import { Card } from './card';

const SUIT_BY_SYMBOL = { '♣': 'clubs', '♥': 'hearts', '♠': 'spades', '♦': 'diamonds' } as const;

/** c('3♣') => { rank: '3', suit: 'clubs' } */
export function c(text: string): Card {
  const rank = text.slice(0, -1) as Card['rank'];
  const symbol = text.slice(-1) as keyof typeof SUIT_BY_SYMBOL;
  return { rank, suit: SUIT_BY_SYMBOL[symbol] };
}
