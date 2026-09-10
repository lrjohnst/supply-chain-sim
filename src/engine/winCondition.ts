import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";
import { corporationNetWorth } from "./utils";

export type WinReason = "won";
export type LossReason = "lost_time_limit" | "lost_ai_won";

export interface WinConditionResult {
  gameOver: boolean;
  isWin: boolean;
  isLoss: boolean;
  winner: string | null;   // corporation ID if player won
  loser: string | null;    // "ai_won" description if AI won
  reason: WinReason | LossReason | null;
  netWorth: number;        // relevant corporation's net worth at evaluation
}

const NO_RESULT: WinConditionResult = {
  gameOver: false, isWin: false, isLoss: false,
  winner: null, loser: null, reason: null, netWorth: 0,
};

/**
 * Evaluate all win/loss conditions. Reports only — never mutates state.
 *
 * Evaluation order (Decision 2 — simultaneous win goes to player):
 *   1. Player net worth threshold → player wins
 *   2. AI net worth threshold → player loses (Decision 1)
 *   3. Time limit → player loses
 *
 * AI bankruptcy (Decision 4) is handled in the obligation subsystems,
 * not here. Eliminated AI is simply absent from this check.
 *
 * The same corporationNetWorth() formula is used for both corporations
 * (Decision 5).
 *
 * Bankruptcy during Keep Playing is a loss — phase will be overwritten
 * to "lost" by tick.ts when BankruptcyError is caught (Decision 3).
 *
 * Post-MVP: add domination, supply chain monopoly, conglomerate,
 * greenhouse gas free win conditions here.
 */
export function checkWinCondition(state: GameState): WinConditionResult {
  const threshold = GameConfig.game.netWorthWinThreshold;

  // Player checked first — simultaneous win goes to player (Decision 2)
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (playerCorp) {
    const playerNW = corporationNetWorth(state, playerCorp.id);
    if (playerNW >= threshold) {
      return {
        gameOver: true, isWin: true, isLoss: false,
        winner: playerCorp.id, loser: null, reason: "won", netWorth: playerNW,
      };
    }
  }

  // AI checked second — if AI wins, player loses (Decision 1, 6)
  const aiCorp = Object.values(state.corporations).find((c) => !c.isPlayer && !c.eliminated);
  if (aiCorp) {
    const aiNW = corporationNetWorth(state, aiCorp.id);
    if (aiNW >= threshold) {
      return {
        gameOver: true, isWin: false, isLoss: true,
        winner: null, loser: aiCorp.id, reason: "lost_ai_won", netWorth: aiNW,
      };
    }
  }

  // Time limit — disabled; stub kept for future re-activation.
  // if (state.turn + 1 >= GameConfig.game.turnsNormal) { ... }

  return NO_RESULT;
}
