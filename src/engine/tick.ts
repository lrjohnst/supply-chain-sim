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
import { checkWinCondition } from "./winCondition";
import { BankruptcyError, estimateTurnsToBankruptcy, type BankruptcyReason } from "./bankruptcy";

export interface TickResult {
  firedEvents: MacroEvent[];
  newTurn: number;
  isLoss: boolean;
  justWon: boolean;
  winner: string | null;
  bankruptcyReason: BankruptcyReason | null;
  /** Estimated turns before bankruptcy at current burn rate. Null if burn is positive. */
  turnsToBankruptcy: number | null;
}

/**
 * Advance the game by one turn. Mutates GameState in place.
 *
 * Turn sequence:
 *  1.  Fire pending macro events
 *  2.  Advance investments
 *  3.  Run farm/factory production
 *  4.  Execute active contracts          ← bankruptcy check
 *  5.  Evaluate closing tenders
 *  6.  Run retail (B2C) sales
 *  7.  Process loans                     ← bankruptcy check
 *  8.  Deduct operating costs            ← bankruptcy check
 *  9.  Update firm quality
 *  10. Estimate turns-to-bankruptcy (early warning data, no side effects)
 *  11. Run AI decisions
 *  12. Check win/loss conditions
 *  13. Generate upcoming macro events
 *  14. Advance turn counter
 *
 * Any BankruptcyError thrown by steps 4, 7, or 8 is caught here.
 * On bankruptcy: state.phase = "lost", tick returns immediately.
 */
export function tick(state: GameState): TickResult {
  const firedEvents = firePendingEvents(state);
  advanceInvestments(state);
  runProduction(state);

  // Steps that may throw BankruptcyError
  try {
    executeContracts(state);
    evaluateTenders(state);
    runRetailSales(state);
    processLoans(state);
    deductOperatingCosts(state);
  } catch (e) {
    if (e instanceof BankruptcyError) {
      state.phase = "lost";
      return {
        firedEvents,
        newTurn: state.turn,
        isLoss: true,
        justWon: false,
        winner: null,
        bankruptcyReason: e.reason,
        turnsToBankruptcy: null,
      };
    }
    throw e;
  }

  updateQuality(state);

  // Step 10: estimate turns-to-bankruptcy for early warning
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  const turnsToBankruptcy = playerCorp
    ? estimateTurnsToBankruptcy(state, playerCorp.id, GameConfig.bankruptcy.lookbackTurns)
    : null;

  runAI(state);

  const result = checkWinCondition(state);

  if (result.isLoss) {
    state.phase = "lost";
    return {
      firedEvents, newTurn: state.turn, isLoss: true,
      justWon: false, winner: null, bankruptcyReason: null, turnsToBankruptcy,
    };
  }

  const justWon = result.isWin && state.phase !== "won";
  if (justWon) state.phase = "won";

  generateUpcomingEvents(state);
  state.turn += 1;

  return {
    firedEvents, newTurn: state.turn, isLoss: false,
    justWon, winner: result.winner, bankruptcyReason: null, turnsToBankruptcy,
  };
}
