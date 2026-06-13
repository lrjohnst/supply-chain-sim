import type { GameState, MacroEvent } from "../types";
import { GameConfig } from "../config/gameConfig";
import { firePendingEvents, generateUpcomingEvents } from "./macroEvents";
import { tickHarborPrices } from "./harbor";
import { advanceInvestments, type PausedInvestmentInfo } from "./investments";
import { runProduction } from "./production";
import { executeContracts, checkContractRisks, type ContractWarning, type BreachGateProposal } from "./contracts";
import { evaluateTenders, processRenewals } from "./tenders";
import { runHarborSpotPurchases } from "./harborSpotPurchase";
import { runRetailSales } from "./retail";
import { processLoans } from "./loans";
import { deductOperatingCosts, updateQuality } from "./operatingCosts";
import { runAI } from "./ai";
import { tickCities } from "./city";
import { checkWinCondition } from "./winCondition";
import { BankruptcyError, estimateTurnsToBankruptcy, type BankruptcyReason } from "./bankruptcy";
import { appendSnapshot } from "./history";
import type { LossReason } from "./winCondition";

export interface TickResult {
  firedEvents: MacroEvent[];
  newTurn: number;
  /** True if the player lost this turn (bankruptcy, AI win, or time limit). */
  isLoss: boolean;
  /** True if phase just transitioned to "won" this turn. */
  justWon: boolean;
  winner: string | null;
  bankruptcyReason: BankruptcyReason | null;
  lossReason: LossReason | "lost_bankruptcy" | null;
  /** Estimated turns before bankruptcy at current burn rate. Null if burn is positive. */
  turnsToBankruptcy: number | null;
  /** Player investments that paused this turn due to insufficient funds. */
  pausedInvestments: PausedInvestmentInfo[];
  /** Active contract breach risk warnings with stable IDs. */
  contractWarnings: ContractWarning[];
  /** Breach conditions met this tick that require player action (gate) or AI auto-handling. */
  breachGateProposals: BreachGateProposal[];
}

/**
 * Advance the game by one turn. Mutates GameState in place.
 *
 * Turn sequence:
 *  1.  Fire pending macro events
 *  2.  Tick harbor prices (base + shock displacement + noise)
 *  3.  Advance investments
 *  4.  Run farm/factory production
 *  5.  Execute active contracts          ← bankruptcy check
 *  6.  Evaluate closing tenders
 *  7.  Harbor spot purchases for stores  ← bankruptcy check
 *  8.  Run retail (B2C) sales
 *  8.  Process loans                     ← bankruptcy check
 *  9.  Deduct operating costs            ← bankruptcy check
 *  10. Update firm quality
 *  11. Estimate turns-to-bankruptcy (early warning, no side effects)
 *  12. Run AI decisions
 *  13. Check win/loss conditions
 *  14. Generate upcoming macro events
 *  15. Append economic snapshot
 *  16. Advance turn counter
 *
 * Any BankruptcyError thrown by steps 5, 8, or 9 is caught here.
 * On bankruptcy: state.phase = "lost", tick returns immediately.
 */
export function tick(state: GameState): TickResult {
  const firedEvents = firePendingEvents(state);

  // Step 2: recalculate harbor prices with noise + shock decay
  const harborData = tickHarborPrices(state);

  const pausedInvestments = advanceInvestments(state);
  runProduction(state);

  // Steps that may throw BankruptcyError
  let retailData;
  let contractWarnings: ContractWarning[] = [];
  let breachGateProposals: BreachGateProposal[] = [];
  try {
    breachGateProposals = executeContracts(state);
    processRenewals(state);
    evaluateTenders(state);
    runHarborSpotPurchases(state);
    tickCities(state);
    retailData = runRetailSales(state);
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
        lossReason: "lost_bankruptcy",
        turnsToBankruptcy: null,
        pausedInvestments,
        contractWarnings: [],
        breachGateProposals: [],
      };
    }
    throw e;
  }

  contractWarnings = checkContractRisks(state);

  updateQuality(state);

  // Estimate turns-to-bankruptcy for early warning
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  const turnsToBankruptcy = playerCorp
    ? estimateTurnsToBankruptcy(state, playerCorp.id, GameConfig.bankruptcy.lookbackTurns)
    : null;

  runAI(state);

  const result = checkWinCondition(state);

  if (result.isLoss) {
    state.phase = "lost";
    return {
      firedEvents,
      newTurn: state.turn,
      isLoss: true,
      justWon: false,
      winner: null,
      bankruptcyReason: null,
      lossReason: result.reason,
      turnsToBankruptcy,
      pausedInvestments,
      contractWarnings,
      breachGateProposals,
    };
  }

  const justWon = result.isWin && state.phase !== "won";
  if (justWon) state.phase = "won";

  generateUpcomingEvents(state);

  // Step 15: record economic snapshot before incrementing turn
  appendSnapshot(state, harborData, retailData);

  state.turn += 1;

  // Trim transaction ledger to rolling window to prevent unbounded growth
  const txCutoff = state.turn - GameConfig.transactions.rollingWindowTurns;
  if (txCutoff > 0) {
    state.transactions = state.transactions.filter((tx) => tx.turn >= txCutoff);
  }

  return {
    firedEvents,
    newTurn: state.turn,
    isLoss: false,
    justWon,
    winner: result.winner,
    bankruptcyReason: null,
    lossReason: null,
    turnsToBankruptcy,
    pausedInvestments,
    contractWarnings,
    breachGateProposals,
  };
}
