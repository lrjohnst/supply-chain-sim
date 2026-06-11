import type { GameState, MacroEvent } from "../types";
import { firePendingEvents, generateUpcomingEvents } from "./macroEvents";
import { advanceInvestments } from "./investments";
import { runProduction } from "./production";
import { executeContracts } from "./contracts";
import { evaluateTenders } from "./tenders";
import { runRetailSales } from "./retail";
import { processLoans } from "./loans";
import { deductOperatingCosts, updateQuality } from "./operatingCosts";
import { runAI } from "./ai";
import { checkWinCondition } from "./winCondition";

export interface TickResult {
  firedEvents: MacroEvent[];
  newTurn: number;
  gameOver: boolean;
  winner: string | null;
}

/**
 * Advance the game by one turn. Mutates GameState in place.
 * Call this when the player confirms end-of-turn.
 *
 * Turn sequence:
 *  1.  Fire pending macro events
 *  2.  Advance investments
 *  3.  Run farm/factory production
 *  4.  Execute active contracts
 *  5.  Evaluate closing tenders
 *  6.  Run retail (B2C) sales
 *  7.  Process loans (interest + repayment)
 *  8.  Deduct operating, training, marketing costs
 *  9.  Update firm quality
 *  10. Run AI decisions
 *  11. Check win/loss conditions
 *      - Win: set pendingWin notification, continue turn (player decides when to end)
 *      - Loss: set phase to "lost", return early (no choice, no events queued)
 *  12. Generate upcoming macro events
 *  13. Advance turn counter
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

  // 11. Win/loss check
  const result = checkWinCondition(state);

  if (result.isLoss) {
    // Loss: end immediately, no player choice
    state.phase = "lost";
    return { firedEvents, newTurn: state.turn, gameOver: true, winner: null };
  }

  if (result.isWin && !state.pendingWin?.suppressFuture) {
    // Win: notify player — they choose when to end
    // Only set if no prior suppressed notification exists
    state.pendingWin = {
      winner: result.winner!,
      netWorth: result.netWorth,
      turn: state.turn,
      suppressFuture: false,
    };
    // Game continues — fall through to generate events and advance turn
  }

  // 12. Generate upcoming macro events (only if game is still playing)
  generateUpcomingEvents(state);

  // 13. Advance turn counter
  state.turn += 1;

  return { firedEvents, newTurn: state.turn, gameOver: false, winner: null };
}
