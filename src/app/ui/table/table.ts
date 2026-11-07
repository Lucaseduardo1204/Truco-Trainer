import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Card, CARDS_PER_HAND, cardStrength, isSameCard, Suit } from '../../engine/card';
import {
  AcceptAction,
  HandAction,
  nextStake,
  PlayCardAction,
  RaiseAction,
  RunAction,
  SignalAction,
  Stake,
  Team,
  teamOf,
} from '../../engine/hand';
import { Signal } from '../../engine/signals';
import { PlayerView } from '../../engine/view';
import { GameService, HUMAN_SEAT } from '../../game/game.service';
import { PlayingCard } from '../playing-card/playing-card';

/** Where a seat is drawn. The human is always at the bottom. */
type Position = 'bottom' | 'right' | 'top' | 'left';

/** Turn order goes counter-clockwise: me (bottom) → right → top → left. */
const POSITIONS: Record<number, readonly Position[]> = {
  2: ['bottom', 'top'],
  4: ['bottom', 'right', 'top', 'left'],
};

const SEAT_NAMES: Record<number, readonly string[]> = {
  2: ['Você', 'Bot'],
  4: ['Você', 'Rival 1', 'Parceiro', 'Rival 2'],
};

/** Short text inside each avatar circle. */
const AVATARS: Record<number, readonly string[]> = {
  2: ['EU', 'B'],
  4: ['EU', 'R1', 'P', 'R2'],
};

const SUIT_NAMES: Record<Suit, string> = {
  clubs: 'paus',
  hearts: 'copas',
  spades: 'espadas',
  diamonds: 'ouros',
};

const STAKE_NAMES: Record<Stake, string> = { 1: '', 3: 'Truco', 6: 'Seis', 9: 'Nove', 12: 'Doze' };

interface SignalInfo {
  readonly emoji: string;
  /** What the card is: "Zap", "Três"... */
  readonly meaning: string;
  /** The gesture, as seen at the table: "Piscou"... */
  readonly gesture: string;
}

const SIGNAL_INFO: Record<Signal, SignalInfo> = {
  zap: { emoji: '😉', meaning: 'Zap', gesture: 'Piscou' },
  copas: { emoji: '🤨', meaning: 'Copas', gesture: 'Ergueu a sobrancelha' },
  espadao: { emoji: '😏', meaning: 'Espadão', gesture: 'Entortou a boca' },
  picaFumo: { emoji: '😛', meaning: 'Pica-fumo', gesture: 'Mostrou a língua' },
  tres: { emoji: '😬', meaning: 'Três', gesture: 'Mordeu o lábio' },
  nothing: { emoji: '🤷', meaning: 'Nada', gesture: 'Encolheu os ombros' },
  leaveItToMe: { emoji: '💪', meaning: 'Deixa comigo', gesture: 'Bateu no peito' },
};

/** A signal as shown on a seat's avatar. */
interface SeatSignal extends SignalInfo {
  /** A rival's signal that the human caught. */
  readonly caught: boolean;
}

/** A signal button the human can press. */
interface SignalChoice {
  readonly action: SignalAction;
  readonly emoji: string;
  readonly label: string;
  readonly hint: string;
}

type RoundMark = 'win' | 'lose' | 'tie' | 'pending';
type Tone = 'win' | 'lose' | 'neutral';

interface SeatInfo {
  readonly seat: number;
  readonly position: Position;
  readonly name: string;
  readonly avatar: string;
  /** Same team as the human (including the human). */
  readonly ally: boolean;
  /** [0, 1, 2] for 3 face-down cards, [0, 1] for 2... */
  readonly slots: readonly number[];
  readonly isStarter: boolean;
  readonly isActing: boolean;
  /** Speech bubble ("Truco!", "Corri!", "😉 Piscou") right after this seat acted. */
  readonly bubble: string | null;
  /** The signal this seat made this hand, if the human knows it. */
  readonly signal: SeatSignal | null;
}

interface TablePlay {
  readonly seat: number;
  readonly card: Card;
  readonly position: Position;
  readonly ally: boolean;
  /** Highlighted: this card won the round being shown. */
  readonly winner: boolean;
}

interface Banner {
  readonly tone: Tone;
  readonly title: string;
  readonly detail: string;
}

/**
 * The game table, for 2 or 4 players. Only reads GameService signals and sends
 * actions back: every rule decision comes from the engine via the legal actions.
 */
@Component({
  selector: 'app-table',
  imports: [PlayingCard],
  templateUrl: './table.html',
  styleUrl: './table.scss',
})
export class Table {
  protected readonly game = inject(GameService);
  private readonly router = inject(Router);
  protected readonly view = this.game.view;

  // --- Actions offered by the engine -------------------------------------------------

  protected readonly playActions = computed(() =>
    this.game.myActions().filter((a): a is PlayCardAction => a.type === 'playCard'),
  );
  protected readonly raiseAction = computed(() =>
    this.game.myActions().find((a): a is RaiseAction => a.type === 'raise'),
  );
  protected readonly acceptAction = computed(() =>
    this.game.myActions().find((a): a is AcceptAction => a.type === 'accept'),
  );
  protected readonly runAction = computed(() =>
    this.game.myActions().find((a): a is RunAction => a.type === 'run'),
  );

  /** Signal buttons, during the signal round when it's the human's turn. */
  protected readonly signalChoices = computed((): SignalChoice[] =>
    this.game
      .myActions()
      .filter((a): a is SignalAction => a.type === 'signal')
      .map((action) =>
        action.signal === null
          ? { action, emoji: '🤐', label: 'Ficar quieto', hint: 'não sinalizar' }
          : {
              action,
              emoji: SIGNAL_INFO[action.signal].emoji,
              label: SIGNAL_INFO[action.signal].meaning,
              hint: SIGNAL_INFO[action.signal].gesture.toLowerCase(),
            },
      ),
  );

  // --- Seats -------------------------------------------------------------------------

  protected readonly seats = computed((): SeatInfo[] => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const bubble = this.bubble();
    const seats: SeatInfo[] = [];
    for (let seat = 0; seat < view.playerCount; seat++) {
      seats.push({
        seat,
        position: POSITIONS[view.playerCount][seat],
        name: SEAT_NAMES[view.playerCount][seat],
        avatar: AVATARS[view.playerCount][seat],
        ally: teamOf(seat) === view.team,
        slots: slots(this.cardsLeft(view, seat)),
        isStarter: view.starterSeat === seat,
        isActing: this.game.actingSeat() === seat,
        bubble: bubble?.seat === seat ? bubble.text : null,
        signal: this.seatSignal(view, seat),
      });
    }
    return seats;
  });

  protected readonly me = computed(() => this.seats().find((s) => s.seat === HUMAN_SEAT) ?? null);
  protected readonly otherSeats = computed(() => this.seats().filter((s) => s.seat !== HUMAN_SEAT));

  // --- Score ---------------------------------------------------------------------------

  protected readonly myTeamName = computed(() => (this.view()?.playerCount === 4 ? 'Nós' : 'Você'));
  protected readonly theirTeamName = computed(() => (this.view()?.playerCount === 4 ? 'Eles' : 'Bot'));
  protected readonly myScore = computed(() => this.scoreOf('mine'));
  protected readonly theirScore = computed(() => this.scoreOf('theirs'));

  /** 0..100: how close a score is to the target. */
  protected progress(score: number): number {
    const target = this.view()?.targetScore ?? 12;
    return Math.min(100, (score / target) * 100);
  }

  protected readonly modeLabel = computed(() => {
    const view = this.view();
    if (!view) {
      return '';
    }
    if (view.mode.kind === 'eleven') {
      return `Mão de ${view.targetScore - 1}`;
    }
    return view.mode.kind === 'iron' ? 'Mão de ferro' : '';
  });

  // --- Center of the table -------------------------------------------------------------

  /** Mão de ferro: the human plays without seeing their cards. */
  protected readonly blind = computed(() => this.view()?.mode.kind === 'iron');

  /** Cards on the table: the current round, or the last finished one until someone plays. */
  protected readonly tablePlays = computed((): TablePlay[] => {
    const view = this.view();
    if (!view) {
      return [];
    }
    const lastRound = view.completedRounds.at(-1);
    const showingFinishedRound = view.currentPlays.length === 0 && lastRound !== undefined;
    const plays = showingFinishedRound ? lastRound.plays : view.currentPlays;

    // In a finished (non-tied) round, highlight the winning team's best card.
    let winningStrength = -1;
    if (showingFinishedRound && lastRound.result !== 'tie') {
      const result = lastRound.result;
      winningStrength = Math.max(
        ...plays.filter((p) => teamOf(p.seat) === result).map((p) => cardStrength(p.card)),
      );
    }

    return plays.map((play) => ({
      seat: play.seat,
      card: play.card,
      position: POSITIONS[view.playerCount][play.seat],
      ally: teamOf(play.seat) === view.team,
      winner: cardStrength(play.card) === winningStrength,
    }));
  });

  protected readonly roundMarks = computed((): RoundMark[] => {
    const view = this.view();
    return [0, 1, 2].map((index) => {
      const result = view?.completedRounds[index]?.result;
      if (result === undefined) {
        return 'pending';
      }
      if (result === 'tie') {
        return 'tie';
      }
      return result === view!.team ? 'win' : 'lose';
    });
  });

  // --- Buttons, status and banners -------------------------------------------------------

  protected readonly raiseLabel = computed(() => {
    const view = this.view();
    if (!view) {
      return '';
    }
    // Outside a normal hand the button exists, but asking loses the hand.
    if (view.mode.kind !== 'normal') {
      return 'Truco!';
    }
    const next = nextStake(view.pendingBet ? view.pendingBet.requested : view.stake);
    return next ? `${STAKE_NAMES[next]}!` : '';
  });

  protected readonly acceptLabel = computed(() =>
    this.view()?.elevenDeciderSeat === HUMAN_SEAT ? 'Jogar (vale 3)' : 'Aceitar',
  );

  /** One line describing what is happening now (empty once the hand is over). */
  protected readonly status = computed(() => {
    const view = this.view();
    if (!view || view.handFinished) {
      return '';
    }
    if (view.signalingSeat !== null) {
      return view.signalingSeat === HUMAN_SEAT
        ? 'Rodada de sinais: avise seu parceiro (os rivais podem flagrar)'
        : `${this.nameOf(view.signalingSeat)} fazendo sinal…`;
    }
    if (view.elevenDeciderSeat !== null) {
      return view.elevenDeciderSeat === HUMAN_SEAT
        ? `${this.modeLabel()}: jogar (vale 3) ou correr (${this.theirsPhrase(view)} leva 1)?`
        : `${this.nameOf(view.elevenDeciderSeat)} decide a ${this.modeLabel().toLowerCase()}…`;
    }
    if (view.pendingBet) {
      const name = STAKE_NAMES[view.pendingBet.requested];
      const caller = view.pendingBet.callerSeat;
      const responder = view.pendingBet.responderSeat;
      if (responder === HUMAN_SEAT) {
        return `${this.nameOf(caller)} pediu ${name}! Você responde.`;
      }
      if (caller === HUMAN_SEAT) {
        return `Você pediu ${name}. ${this.nameOf(responder)} responde…`;
      }
      return `${this.nameOf(caller)} pediu ${name}. ${this.nameOf(responder)} responde…`;
    }
    const acting = this.game.actingSeat();
    if (acting === HUMAN_SEAT) {
      return 'Sua vez';
    }
    return acting === null ? '' : `${this.nameOf(acting)} pensando…`;
  });

  /** Result of the hand that just ended (null while it's in progress). */
  protected readonly handBanner = computed((): Banner | null => {
    const view = this.view();
    if (!view || !view.handFinished || view.matchFinished) {
      return null;
    }
    const last = this.game.lastAction();
    let detail = '';
    if (last?.type === 'run') {
      detail = `${this.nameOf(last.seat)} correu`;
    } else if (last?.type === 'raise') {
      detail = `${this.nameOf(last.seat)} pediu truco na ${this.modeLabel().toLowerCase()} e perdeu`;
    }

    if (view.handWinner === null) {
      return { tone: 'neutral', title: 'Cangou!', detail: 'Empate nas três rodadas: ninguém pontua' };
    }
    const weWon = view.handWinner === view.team;
    const destination = weWon ? this.minePhrase(view) : view.playerCount === 4 ? 'pra eles' : 'pro bot';
    return { tone: weWon ? 'win' : 'lose', title: `+${view.stake} ${destination}`, detail };
  });

  /** Result of the whole match (null while it's in progress). */
  protected readonly matchBanner = computed((): Banner | null => {
    const view = this.view();
    if (!view || !view.matchFinished) {
      return null;
    }
    const weWon = view.matchWinner === view.team;
    return {
      tone: weWon ? 'win' : 'lose',
      title: weWon ? 'Vitória' : 'Derrota',
      detail: `${this.myScore()} × ${this.theirScore()} em ${view.handNumber} mãos`,
    };
  });

  // --- Template helpers ----------------------------------------------------------------

  /** Back to the start screen (the match is dropped). */
  protected leave(): void {
    this.router.navigate(['/']);
    this.game.leaveMatch();
  }

  protected openReport(id: string): void {
    this.router.navigate(['/relatorio', id]);
    this.game.leaveMatch();
  }

  protected act(action: HandAction | undefined): void {
    if (action) {
      this.game.act(action);
    }
  }

  protected playFor(card: Card): PlayCardAction | undefined {
    return this.playActions().find((action) => isSameCard(action.card, card));
  }

  protected cardLabel(card: Card): string {
    return `${card.rank} de ${SUIT_NAMES[card.suit]}`;
  }

  /** Position of card `index` in a fan of `count`: -1, 0, 1 for three cards. */
  protected fanOffset(index: number, count: number): number {
    return index - (count - 1) / 2;
  }

  // --- Private -------------------------------------------------------------------------

  /** Speech bubble for the latest bet, accept or run in this hand. */
  private readonly bubble = computed((): { seat: number; text: string } | null => {
    const view = this.view();
    const last = this.game.lastAction();
    if (!view || !last || last.type === 'playCard') {
      return null;
    }
    if (last.type === 'signal') {
      // Only signals the human knows about (own, partner's, caught rivals').
      const known = view.knownSignals.find((s) => s.seat === last.seat);
      if (!known) {
        return null;
      }
      const info = SIGNAL_INFO[known.signal];
      return { seat: last.seat, text: `${info.emoji} ${info.gesture}` };
    }
    if (last.type === 'run') {
      return { seat: last.seat, text: 'Corri!' };
    }
    if (last.type === 'accept') {
      return { seat: last.seat, text: view.mode.kind === 'eleven' ? 'Vou jogar!' : 'Aceito!' };
    }
    const requested = view.pendingBet?.callerSeat === last.seat ? view.pendingBet.requested : 3;
    return { seat: last.seat, text: `${STAKE_NAMES[requested]}!` };
  });

  private seatSignal(view: PlayerView, seat: number): SeatSignal | null {
    const known = view.knownSignals.find((s) => s.seat === seat);
    if (!known) {
      return null;
    }
    return { ...SIGNAL_INFO[known.signal], caught: teamOf(seat) !== view.team };
  }

  private nameOf(seat: number): string {
    const view = this.view();
    return view ? SEAT_NAMES[view.playerCount][seat] : '';
  }

  private scoreOf(side: 'mine' | 'theirs'): number {
    const view = this.view();
    if (!view) {
      return 0;
    }
    const team: Team = side === 'mine' ? view.team : view.team === 0 ? 1 : 0;
    return view.scores[team];
  }

  /** "pra você" / "pra nós" */
  private minePhrase(view: PlayerView): string {
    return view.playerCount === 4 ? 'pra nós' : 'pra você';
  }

  /** "o bot" / "eles" (subject form) */
  private theirsPhrase(view: PlayerView): string {
    return view.playerCount === 4 ? 'eles' : 'o bot';
  }

  /** Cards a seat still holds: 3 minus what it already put on the table. */
  private cardsLeft(view: PlayerView, seat: number): number {
    const plays = [...view.completedRounds.flatMap((round) => round.plays), ...view.currentPlays];
    return CARDS_PER_HAND - plays.filter((play) => play.seat === seat).length;
  }
}

/** slots(3) => [0, 1, 2] */
function slots(count: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    result.push(i);
  }
  return result;
}
