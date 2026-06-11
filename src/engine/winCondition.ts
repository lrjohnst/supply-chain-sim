import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";
import { corporationNetWorth } from "./utils";

export type WinReason = "won" | "lost_time_limit";

export interface WinConditionResult {
  gameOver: boolean;
  winner: string | null;   // corporation ID, or null if no winner
  reason: WinReason | null;
}

/**
 * Evaluate all win/loss conditions against the current game state.
 * Called after AI decisions and before generating upcoming events.
 *
 * Post-MVP: additional win conditions (domination, supply chain monopoly,
 * conglomerate, greenhouse gas free) will be added as further checks here.
 */
export function checkWinCondition(state: GameState): WinConditionResult {
  const threshold = GameConfig.game.netWorthWinThreshold;

  // Check net worth win for all corporations
  for (const corp of Object.values(state.corporations)) {
    const nw = corporationNetWorth(state, corp.id);
    if (nw >= threshold) {
      return { gameOver: true, winner: corp.id, reason: "won" };
    }
  }

  // Check time limit
  if (state.turn + 1 >= GameConfig.game.turnsNormal) {
    return { gameOver: true, winner: null, reason: "lost_time_limit" };
  }

  return { gameOver: false, winner: null, reason: null };
}
