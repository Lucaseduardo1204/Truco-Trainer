import { computed, inject, Injectable, signal } from '@angular/core';
import { chooseAction, DEFAULT_BOT } from '../bot/bot';
import { PlayerCount } from '../engine/card';
import { HandAction } from '../engine/hand';
import {
  applyMatchAction,
  createMatch,
  getMatchLegalActions,
  MatchState,
  startNextHand,
  TargetScore,
} from '../engine/match';
import { createRng, Rng } from '../engine/random';
import { getPlayerView } from '../engine/view';
import { MatchHistoryService, SavedMatch } from './match-history.service';
import { StatsPanelState } from './stats-panel-state.service';

/** The human always sits at seat 0. Every other seat is a bot. */
export const HUMAN_SEAT = 0;

/** What the player picks on the setup screen. */
export interface MatchOptions {
  readonly targetScore: TargetScore;
  readonly playerCount: PlayerCount;
}

/** Pause before each bot move, so the human can follow what happened. */
export const BOT_DELAY_MS = 800;

/** Shorter pause for bot signals at the start of a 2x2 hand. */
export const SIGNAL_DELAY_MS = 550;

/**
 * Bridges the engine and the UI. Holds the match in a signal; components read
 * the signals and call the methods below. No game rules here: the engine decides.
 */
@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly history = inject(MatchHistoryService);
  private readonly statsPanel = inject(StatsPanelState);
  private readonly matchState = signal<MatchState | null>(null);

  /** The human decided at least once with the 📊 panel on during this match. */
  private assisted = false;

  private readonly lastSavedState = signal<SavedMatch | null>(null);

  /** The finished match as it was saved (with its summary), or null while playing. */
  readonly lastSaved = this.lastSavedState.asReadonly();
  private botRng: Rng = createRng(randomSeed());
  private botTimer: ReturnType<typeof setTimeout> | null = null;

  /** Read-only from outside: only this service changes the match. */
  readonly match = this.matchState.asReadonly();

  /** What the human is allowed to see. */
  readonly view = computed(() => {
    const match = this.matchState();
    return match ? getPlayerView(match, HUMAN_SEAT) : null;
  });

  /** Actions the human can take right now (empty while waiting for the bot). */
  readonly myActions = computed(() => {
    const match = this.matchState();
    return match ? getMatchLegalActions(match).filter((action) => action.seat === HUMAN_SEAT) : [];
  });

  /** Most recent action in the current hand, by anyone (public info, e.g. "the bot ran"). */
  readonly lastAction = computed(() => {
    const match = this.matchState();
    const last = match?.history.at(-1);
    return last && last.handNumber === match!.handNumber ? last.action : null;
  });

  /** Seat that must act now, or null when nobody can (hand or match over). */
  readonly actingSeat = computed(() => {
    const match = this.matchState();
    return match ? (getMatchLegalActions(match)[0]?.seat ?? null) : null;
  });

  /** True while a bot is about to act. */
  readonly botToAct = computed(() => {
    const seat = this.actingSeat();
    return seat !== null && seat !== HUMAN_SEAT;
  });

  /** `seed` is only passed by tests; the app gets a random one. */
  startMatch(options: MatchOptions, seed: number = randomSeed()): void {
    this.cancelBot();
    this.botRng = createRng(randomSeed());
    this.lastSavedState.set(null);
    this.assisted = false;
    this.matchState.set(createMatch({ ...options, seed }));
    this.scheduleBot();
  }

  /** Back to the setup screen. */
  leaveMatch(): void {
    this.cancelBot();
    this.matchState.set(null);
  }

  /** Human action. The engine throws if it's not legal. */
  act(action: HandAction): void {
    if (action.seat !== HUMAN_SEAT) {
      throw new Error('act() is only for the human seat');
    }
    if (this.statsPanel.enabled()) {
      this.assisted = true; // this decision was made with the statistics on screen
    }
    this.apply(action);
  }

  /** Called by the UI after showing a finished hand. */
  nextHand(): void {
    const match = this.requireMatch();
    this.matchState.set(startNextHand(match));
    this.scheduleBot();
  }

  private apply(action: HandAction): void {
    const match = applyMatchAction(this.requireMatch(), action);
    this.matchState.set(match);
    // The action that ends the match is applied exactly once, so the match is saved once.
    if (match.finished) {
      this.lastSavedState.set(this.history.save(match.config, match.history, HUMAN_SEAT, this.assisted));
    }
    this.scheduleBot();
  }

  /** If it's a bot's turn, plays for it after a short pause. */
  private scheduleBot(): void {
    this.cancelBot();
    if (!this.botToAct()) {
      return;
    }
    const signaling = this.requireMatch().hand.signalingSeat !== null;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const match = this.requireMatch();
      const legal = getMatchLegalActions(match);
      const seat = legal[0].seat;
      this.apply(chooseAction(getPlayerView(match, seat), legal, DEFAULT_BOT, this.botRng));
    }, signaling ? SIGNAL_DELAY_MS : BOT_DELAY_MS);
  }

  private cancelBot(): void {
    if (this.botTimer !== null) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
  }

  private requireMatch(): MatchState {
    const match = this.matchState();
    if (!match) {
      throw new Error('No match started');
    }
    return match;
  }
}

/** Seeds come from Math.random here, in the UI layer. The engine itself never uses it. */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}
