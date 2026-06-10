import type { GameState, MacroEvent } from "../types";
import { GameConfig } from "../config/gameConfig";
import { firePendingEvents, generateUpcomingEvents } from "./macroEvents";
import { advanceInvestments } from "./investments";
import { runProduction } from "./production";
import { executeContracts } from "./contracts";
import { evaluateTenders } from "./tenders";
import { runRetailSales } from "./retail";
import { processLoans } from "./loans";
import { deductOperatingCosts, updateQuality } from "./operatingCosts";
import { runAI } from "./ai";
import { corporationNetWorth } from "./utils";

export interface TickResult {
  firedEvents: MacroEvent[];
  newTurn: number;
  gameOver: boolean;
  winner: string | null;
}

/**
 * Advance the game by one turn. Pure function over GameState (mutates in place).
 * Call this when the player confirms end-of-turn.
 *
 * Turn sequence:
 *  1. Fire pending macro events
 *  2. Advance investments
 *  3. Run farm/factory production
 *  4. Execute active contracts
 *  5. Evaluate closing tenders
 *  6. Run retail (B2C) sales
 *  7. Process loans (interest + repayment)
 *  8. Deduct operating, training, marketing costs
 *  9. Update firm quality
 * 10. Run AI decisions for next turn
 * 11. Generate upcoming macro events
 * 12. Check win condition
 * 13. Advance turn counter
 */
export function tick(state: GameState): TickResult {
  // 1. Fire pending macro events
  const firedEvents = firePendingEvents(state);

  // 2. Advance investments
  advanceInvestments(state);

  // 3. Production
  runProduction(state);

  // 4. Contracts
  executeContracts(state);

  // 5. Tenders
  evaluateTenders(state);

  // 6. Retail
  runRetailSales(state);

  // 7. Loans
  processLoans(state);

  // 8. Operating costs
  deductOperatingCosts(state);

  // 9. Quality
  updateQuality(state);

  // 10. AI
  runAI(state);

  // 11. Generate upcoming events
  generateUpcomingEvents(state);

  // 12. Win condition
  const { gameOver, winner } = checkWinCondition(state);
  if (gameOver) {
    state.phase = winner ? "won" : "lost";
  }

  // 13. Advance turn
  state.turn += 1;

  if (state.turn >= GameConfig.game.turnsNormal && !gameOver) {
    state.phase = "lost"; // time limit reached without winning
  }

  return { firedEvents, newTurn: state.turn, gameOver, winner };
}

function checkWinCondition(state: GameState): { gameOver: boolean; winner: string | null } {
  const threshold = GameConfig.game.netWorthWinThreshold;

  for (const corp of Object.values(state.corporations)) {
    const nw = corporationNetWorth(state, corp.id);
    if (nw >= threshold) {
      return { gameOver: true, winner: corp.id };
    }
  }

  return { gameOver: false, winner: null };
}
