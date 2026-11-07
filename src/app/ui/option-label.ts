import { Suit } from '../engine/card';
import { HandAction, nextStake, Stake } from '../engine/hand';
import { PlayerView } from '../engine/view';

const SUIT_SYMBOLS: Record<Suit, string> = { clubs: '♣', hearts: '♥', spades: '♠', diamonds: '♦' };

const STAKE_WORDS: Record<Stake, string> = { 1: '', 3: 'truco', 6: 'seis', 9: 'nove', 12: 'doze' };

/**
 * How an option reads to the player, given the moment it was available:
 * "Jogar 3♥", "Pedir seis", "Aceitar", "Jogar a mão de 11", "Correr".
 * Used by the live statistics panel and by the report.
 */
export function optionLabel(action: HandAction, view: PlayerView): string {
  switch (action.type) {
    case 'playCard':
      return `Jogar ${action.card.rank}${SUIT_SYMBOLS[action.card.suit]}`;
    case 'raise': {
      // Outside a normal hand asking for truco loses the hand, but it's still "truco".
      if (view.mode.kind !== 'normal') {
        return 'Pedir truco';
      }
      const next = nextStake(view.pendingBet ? view.pendingBet.requested : view.stake);
      return `Pedir ${next ? STAKE_WORDS[next] : 'mais'}`;
    }
    case 'accept':
      return view.elevenDeciderSeat === view.seat ? 'Jogar a mão de 11' : 'Aceitar';
    case 'run':
      return 'Correr';
    default:
      return '';
  }
}
