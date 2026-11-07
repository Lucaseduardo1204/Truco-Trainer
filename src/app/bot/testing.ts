// Helpers for spec files only. Not used by the app.

import { PlayerCount } from '../engine/card';
import { HandAction, teamOf } from '../engine/hand';
import {
  applyMatchAction,
  createMatch,
  getMatchLegalActions,
  MatchConfig,
  MatchState,
  startNextHand,
} from '../engine/match';
import { createRng, Rng } from '../engine/random';
import { getPlayerView, PlayerView } from '../engine/view';
import { chooseBaselineAction } from './baseline';
import { chooseAction, DEFAULT_BOT } from './bot';

/** A way of choosing a move from what a seat sees. */
export type Policy = (view: PlayerView, legal: readonly HandAction[], rng: Rng) => HandAction;

/** The bot the app uses today. */
export const currentBot: Policy = (view, legal, rng) => chooseAction(view, legal, DEFAULT_BOT, rng);

/** The frozen first bot, the yardstick for improvements. */
export const baselineBot: Policy = (view, legal, rng) => chooseBaselineAction(view, legal, rng);

/** A whole match where every seat (the human one too) is played by the default bot. */
export function playBotMatch(config: MatchConfig): MatchState {
  return playMatch(config, () => currentBot, createRng(config.seed));
}

export interface ArenaResult {
  readonly matches: number;
  /** Matches won by policy A. */
  readonly winsA: number;
  /** 0..1 */
  readonly winRateA: number;
}

/**
 * Policy A (team 0) against policy B (team 1), one match per seed... and then the same
 * seed again with the teams swapped, so neither policy gets the better cards overall.
 */
export function runArena(
  a: Policy,
  b: Policy,
  playerCount: PlayerCount,
  seeds: number,
  targetScore: 12 | 24 = 12,
): ArenaResult {
  let winsA = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const config: MatchConfig = { playerCount, targetScore, seed: seed * 7919 };
    for (const aTeam of [0, 1] as const) {
      const policyFor = (seat: number) => (teamOf(seat) === aTeam ? a : b);
      const match = playMatch(config, policyFor, createRng(seed * 31 + aTeam));
      if (match.winner === aTeam) {
        winsA++;
      }
    }
  }
  const matches = seeds * 2;
  return { matches, winsA, winRateA: winsA / matches };
}

function playMatch(config: MatchConfig, policyFor: (seat: number) => Policy, rng: Rng): MatchState {
  let state = createMatch(config);
  while (!state.finished) {
    if (state.hand.finished) {
      state = startNextHand(state);
      continue;
    }
    const legal = getMatchLegalActions(state);
    const seat = legal[0].seat;
    state = applyMatchAction(state, policyFor(seat)(getPlayerView(state, seat), legal, rng));
  }
  return state;
}
