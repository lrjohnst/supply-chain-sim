import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";
import { corporationNetWorth } from "./utils";

export type WinReason = "won";
export type LossReason = "lost_time_limit" | "lost_bankruptcy";

export interface WinConditionResult {
  gameOver: boolean;
  isWin: boolean;            // true = win (player chooses when to end)
  isLoss: boolean;           // true = loss (ends immediately, no choice)
  winner: string | null;     // corporation ID if won
  reason: WinReason | LossReason | null;
  netWorth: number;          // net worth of the relevant corporation at evaluation
}

const NO_RESULT: WinConditionResult = {
  gameOver: false, isWin: false, isLoss: false,
  winner: null, reason: null, netWorth: 0,
};

/**
 * Evaluate all win/loss conditions against the current game state.
 * Reports only — never mutates state.phase or state.pendingWin.
 *
 * Win (player confirms when to end):
 *   - Player net worth reaches the configured threshold.
 *
 * Loss (immediate, no player choice):
 *   - Time limit reached (turn count).
 *   - Player corporation is bankrupt (net worth below zero).
 *
 * Post-MVP: add domination, supply chain monopoly, conglomerate,
 * greenhouse gas free win conditions here.
 */
export function checkWinCondition(state: GameState): WinConditionResult {
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return NO_RESULT;

  const playerNetWorth = corporationNetWorth(state, playerCorp.id);

  // Win: player net worth threshold
  if (playerNetWorth >= GameConfig.game.netWorthWinThreshold) {
    return {
      gameOver: true, isWin: true, isLoss: false,
      winner: playerCorp.id, reason: "won", netWorth: playerNetWorth,
    };
  }

  // Loss: bankruptcy (player net worth below zero)
  if (playerNetWorth < 0) {
    return {
      gameOver: true, isWin: false, isLoss: true,
      winner: null, reason: "lost_bankruptcy", netWorth: playerNetWorth,
    };
  }

  // Loss: time limit
  if (state.turn + 1 >= GameConfig.game.turnsNormal) {
    return {
      gameOver: true, isWin: false, isLoss: true,
      winner: null, reason: "lost_time_limit", netWorth: playerNetWorth,
    };
  }

  return NO_RESULT;
}
