import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";
import { corporationNetWorth } from "./utils";

export type WinReason = "won";
export type LossReason = "lost_time_limit" | "lost_bankruptcy";

export interface WinConditionResult {
  gameOver: boolean;
  isWin: boolean;
  isLoss: boolean;
  winner: string | null;
  reason: WinReason | LossReason | null;
  netWorth: number;
}

const NO_RESULT: WinConditionResult = {
  gameOver: false, isWin: false, isLoss: false,
  winner: null, reason: null, netWorth: 0,
};

/**
 * Evaluate all win/loss conditions. Reports only — never mutates state.
 *
 * Win (phase → "won", player continues until they choose to end):
 *   - Player net worth reaches the configured threshold.
 *
 * Loss (phase → "lost", immediate, no player choice):
 *   - Player net worth below zero (bankruptcy).
 *   - Turn count reached the time limit.
 *
 * Post-MVP: add domination, supply chain monopoly, conglomerate,
 * greenhouse gas free win conditions here.
 */
export function checkWinCondition(state: GameState): WinConditionResult {
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return NO_RESULT;

  const playerNetWorth = corporationNetWorth(state, playerCorp.id);

  // Win: net worth threshold
  if (playerNetWorth >= GameConfig.game.netWorthWinThreshold) {
    return {
      gameOver: true, isWin: true, isLoss: false,
      winner: playerCorp.id, reason: "won", netWorth: playerNetWorth,
    };
  }

  // Loss: bankruptcy
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
