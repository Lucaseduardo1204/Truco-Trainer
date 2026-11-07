// Feedback analyzer, step 3: the mistake detectors.
// Each detector looks at ONE decision, using only what the player could see then.
// Pure TypeScript, no Angular.

import { Card, cardStrength, isManilha, isSameCard } from '../engine/card';
import { nextStake, PlayCardAction, roundsNeeded, roundWinner } from '../engine/hand';
import { chanceRivalsBeat } from '../engine/odds';
import { partnerOf, partnerSaidLeaveItToMe, PlayerView, remainingAnnouncedCards } from '../engine/view';
import { DecisionPoint } from './decisions';

/** A card is "safe" when the rivals have at most this chance of beating it. */
export const SAFE_CARD_MAX_BEAT_CHANCE = 0.2;

/** A hand is "weak" when the rivals have at least this chance of beating its best card. */
export const WEAK_HAND_MIN_BEAT_CHANCE = 0.5;

export type FindingKind = 'ranFromStrong' | 'acceptedWeak' | 'bluff' | 'wastedManilha' | 'burnedBestCard';

export interface Finding {
  readonly kind: FindingKind;
  /** 'mistake' lowers the quality score; 'bluff' is just tracked. */
  readonly severity: 'mistake' | 'bluff';
  readonly decision: DecisionPoint;
  /** What the player did, in player language. */
  readonly did: string;
  /** What would have been better. */
  readonly better: string;
  /** Why, in one line. */
  readonly why: string;
}

/** Runs every detector on one decision. */
export function detectFindings(decision: DecisionPoint): Finding[] {
  // Mão de ferro: the player can't see their cards, so there is nothing to judge.
  if (decision.view.mode.kind === 'iron') {
    return [];
  }
  const detectors = [ranFromStrong, weakBet, wastedManilha, burnedBestCard];
  return detectors.map((detect) => detect(decision)).filter((f): f is Finding => f !== null);
}

// --- Detectors ---------------------------------------------------------------------------------

/** Ran (from a bet or a mão de 11) with enough safe cards to win the hand. */
function ranFromStrong(decision: DecisionPoint): Finding | null {
  const { view, action } = decision;
  if (action.type !== 'run') {
    return null;
  }
  // Safe cards of the whole team: own ones, plus what the partner announced and still holds.
  const ownSafe = safeCards(view);
  const partnerSafe = partnerCards(view).filter(isSafe(view));
  const needed = roundsNeeded(view.completedRounds, view.team);
  if (ownSafe.length + partnerSafe.length < needed) {
    return null;
  }
  const fromEleven = view.elevenDeciderSeat === view.seat;
  const holdings = [
    ownSafe.length > 0 ? `você tinha ${listCards(ownSafe)}` : '',
    partnerSafe.length > 0 ? `seu parceiro sinalizou ${partnerAnnouncement(view)}` : '',
  ]
    .filter((part) => part !== '')
    .join(' e ');
  const rounds = `faltava${needed > 1 ? 'm' : ''} ${needed} rodada${needed > 1 ? 's' : ''}`;
  return {
    kind: 'ranFromStrong',
    severity: 'mistake',
    decision,
    did: fromEleven ? 'Correu na mão de 11' : `Correu do ${betName(view.pendingBet?.requested)}`,
    better: fromEleven ? 'Jogar a mão' : 'Aceitar (ou até aumentar)',
    why: `${capitalize(holdings)}: ${safeWhy(view, [...ownSafe, ...partnerSafe])}, e ${rounds}.`,
  };
}

/** Accepted with a weak hand (mistake), or asked with one (bluff). */
function weakBet(decision: DecisionPoint): Finding | null {
  const { view, action } = decision;
  if (action.type !== 'accept' && action.type !== 'raise') {
    return null;
  }
  // Asking for truco in mão de 11 is a different mistake (not one of these detectors yet).
  if (action.type === 'raise' && view.mode.kind !== 'normal') {
    return null;
  }
  if (!isWeak(view)) {
    return null;
  }
  const fromPartner = partnerCards(view).length > 0;
  const best = bestCard([...view.ownCards, ...partnerCards(view)]);
  const beatChance = best ? Math.round(chanceRivalsBeat(view, best) * 100) : 100;
  const subject = fromPartner ? 'A melhor carta do time (contando o sinal do parceiro)' : 'Sua melhor carta';
  const why = best
    ? `${subject} era ${cardText(best)}, com ${beatChance}% de chance de algum rival bater, e o time não tinha rodada ganha.`
    : 'O time não tinha cartas fortes nem rodada ganha.';

  if (action.type === 'accept') {
    const fromEleven = view.elevenDeciderSeat === view.seat;
    return {
      kind: 'acceptedWeak',
      severity: 'mistake',
      decision,
      did: fromEleven ? 'Jogou a mão de 11 com mão fraca' : `Aceitou o ${betName(view.pendingBet?.requested)} com mão fraca`,
      better: fromEleven ? 'Correr (entrega só 1 ponto)' : 'Correr',
      why,
    };
  }
  const asked = view.pendingBet ? view.pendingBet.requested : view.stake;
  return {
    kind: 'bluff',
    severity: 'bluff',
    decision,
    did: `Blefou pedindo ${betName(nextStake(asked) ?? undefined)}`,
    better: 'Blefe é arma: use quando o rival tende a estar fraco',
    why,
  };
}

/** Closed the round with a manilha when a weaker card would have done the same. */
function wastedManilha(decision: DecisionPoint): Finding | null {
  const { view, action } = decision;
  if (action.type !== 'playCard' || !isManilha(action.card)) {
    return null;
  }
  // Only judge when the player is the last to play this round: the outcome is certain.
  if (view.currentPlays.length !== view.playerCount - 1) {
    return null;
  }
  const outcomeOf = (card: Card) => roundWinner([...view.currentPlays, { seat: view.seat, card }]);
  const played = outcomeOf(action.card);
  const weaker = view.ownCards
    .filter((card) => cardStrength(card) < cardStrength(action.card))
    .sort((a, b) => cardStrength(a) - cardStrength(b));

  if (played === view.team) {
    const cheaperWinner = weaker.find((card) => outcomeOf(card) === view.team);
    if (!cheaperWinner) {
      return null;
    }
    return wasteFinding(decision, action, cheaperWinner, 'a rodada já estava no papo com uma carta mais fraca');
  }

  // The manilha didn't win: if no card would have won, throw the weakest instead.
  const anyWinner = view.ownCards.some((card) => outcomeOf(card) === view.team);
  if (anyWinner || weaker.length === 0) {
    return null;
  }
  return wasteFinding(decision, action, weaker[0], 'nenhuma carta sua ganhava essa rodada');
}

/** Opened the first round with the strongest card, a manilha. */
function burnedBestCard(decision: DecisionPoint): Finding | null {
  const { view, action } = decision;
  const opening = view.completedRounds.length === 0 && view.currentPlays.length === 0;
  if (action.type !== 'playCard' || !opening || !isManilha(action.card) || view.ownCards.length < 2) {
    return null;
  }
  const best = bestCard(view.ownCards)!;
  if (!isSameCard(best, action.card)) {
    return null;
  }
  const others = view.ownCards
    .filter((card) => !isSameCard(card, action.card))
    .sort((a, b) => cardStrength(a) - cardStrength(b));
  return {
    kind: 'burnedBestCard',
    severity: 'mistake',
    decision,
    did: `Abriu a 1ª rodada com ${cardText(action.card)}`,
    better: `Abrir com ${cardText(others[others.length - 1])} e guardar a manilha`,
    why: 'Abrindo de manilha você mostra a força cedo e fica sem ela pra rodada que decide.',
  };
}

// --- Helpers -----------------------------------------------------------------------------------

/** Own cards that the rivals have at most SAFE_CARD_MAX_BEAT_CHANCE of beating. */
export function safeCards(view: PlayerView): Card[] {
  return view.ownCards.filter(isSafe(view));
}

function isSafe(view: PlayerView): (card: Card) => boolean {
  return (card) => chanceRivalsBeat(view, card) <= SAFE_CARD_MAX_BEAT_CHANCE;
}

/** 2x2: the cards the partner announced with a signal the player saw, and hasn't played yet. */
function partnerCards(view: PlayerView): Card[] {
  const partner = partnerOf(view);
  return partner === null ? [] : remainingAnnouncedCards(view, partner);
}

/**
 * The team is weak: no round won yet, and the team's best known card (own cards plus what the
 * partner announced) is more likely to be beaten than not. Never weak when the partner said
 * "deixa comigo": trusting it is the right call.
 */
export function isWeak(view: PlayerView): boolean {
  if (partnerSaidLeaveItToMe(view)) {
    return false;
  }
  const roundsWon = view.completedRounds.filter((round) => round.result === view.team).length;
  const best = bestCard([...view.ownCards, ...partnerCards(view)]);
  return roundsWon === 0 && (best === null || chanceRivalsBeat(view, best) >= WEAK_HAND_MIN_BEAT_CHANCE);
}

/** "o zap", "um 3", "deixa comigo"... in player language. */
function partnerAnnouncement(view: PlayerView): string {
  const partner = partnerOf(view);
  const signal = view.knownSignals.find((s) => s.seat === partner)?.signal;
  const names: Record<string, string> = {
    zap: 'o zap',
    copas: 'o copas',
    espadao: 'o espadão',
    picaFumo: 'o pica-fumo',
    tres: 'um 3',
    leaveItToMe: '"deixa comigo"',
  };
  return signal ? (names[signal] ?? '') : '';
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wasteFinding(decision: DecisionPoint, action: PlayCardAction, better: Card, reason: string): Finding {
  return {
    kind: 'wastedManilha',
    severity: 'mistake',
    decision,
    did: `Gastou ${cardText(action.card)} fechando a rodada`,
    better: `Jogar ${cardText(better)}`,
    why: `Você era o último a jogar e ${reason}: a manilha ficaria guardada.`,
  };
}

function safeWhy(view: PlayerView, safe: readonly Card[]): string {
  const worst = Math.max(...safe.map((card) => chanceRivalsBeat(view, card)));
  return worst === 0 ? 'ninguém podia bater' : `no máximo ${Math.round(worst * 100)}% de chance de serem batidas`;
}

function bestCard(cards: readonly Card[]): Card | null {
  return cards.reduce<Card | null>((best, card) => (!best || cardStrength(card) > cardStrength(best) ? card : best), null);
}

const STAKE_NAMES: Record<number, string> = { 3: 'truco', 6: 'seis', 9: 'nove', 12: 'doze' };

function betName(value: number | undefined): string {
  return value ? STAKE_NAMES[value] : 'truco';
}

const SUIT_SYMBOLS: Record<Card['suit'], string> = { clubs: '♣', hearts: '♥', spades: '♠', diamonds: '♦' };
const MANILHA_NAMES: Record<string, string> = {
  '4clubs': 'zap',
  '7hearts': 'copas',
  Aspades: 'espadão',
  '7diamonds': 'pica-fumo',
};

/** "3♥", or "4♣ (zap)" for manilhas. */
export function cardText(card: Card): string {
  const text = `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
  const name = MANILHA_NAMES[card.rank + card.suit];
  return name && isManilha(card) ? `${text} (${name})` : text;
}

function listCards(cards: readonly Card[]): string {
  return cards.map(cardText).join(' e ');
}
