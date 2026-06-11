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
  /** True if the player lost this turn (bankruptcy or time limit). */
  isLoss: boolean;
  /** True if phase just transitioned to "won" this turn. */
  justWon: boolean;
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
 *      - Win: phase → "won" immediately. Turn continues (events generated, counter advances).
 *        The store handles notification and gate registration on justWon.
 *      - Loss: phase → "lost". Return early — no events for an unplayed turn.
 *  12. Generate upcoming macro events
 *  13. Advance turn counter
 */
export function tick(state: GameState): TickResult {
  const firedEvents = firePendingEvents(state);
  advanceInvestments(state);
  runProduction(state);
  executeContracts(state);
  evaluateTenders(state);
  runRetailSales(state);
  processLoans(state);
  deductOperatingCosts(state);
  updateQuality(state);
  runAI(state);

  const result = checkWinCondition(state);

  if (result.isLoss) {
    state.phase = "lost";
    return { firedEvents, newTurn: state.turn, isLoss: true, justWon: false, winner: null };
  }

  const justWon = result.isWin && state.phase !== "won";
  if (justWon) {
    state.phase = "won";
  }

  // Generate events and advance turn regardless of win state —
  // the player continues playing after winning.
  generateUpcomingEvents(state);
  state.turn += 1;

  return { firedEvents, newTurn: state.turn, isLoss: false, justWon, winner: result.winner };
}
