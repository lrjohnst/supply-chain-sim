import type { GameState, Corporation } from "../types";

// ============================================================
// Bankruptcy — cash-based insolvency
// ============================================================

export interface BankruptcyReason {
  obligation: string;   // human-readable description of what couldn't be paid
  amount: number;       // amount due
  cashAvailable: number;
  shortfall: number;
}

/**
 * Thrown by any subsystem that attempts to deduct an obligation
 * the corporation cannot cover. Caught in tick.ts.
 */
export class BankruptcyError extends Error {
  constructor(public readonly reason: BankruptcyReason) {
    super(
      `Bankruptcy: cannot pay "${reason.obligation}" ` +
      `(€${reason.amount.toLocaleString()} due, ` +
      `€${reason.cashAvailable.toLocaleString()} available)`
    );
    this.name = "BankruptcyError";
  }
}

/**
 * Assert that the corporation can cover an obligation.
 * Throws BankruptcyError if cash is insufficient.
 */
export function requireCash(corp: Corporation, amount: number, obligationName: string): void {
  if (corp.cash < amount) {
    throw new BankruptcyError({
      obligation: obligationName,
      amount,
      cashAvailable: corp.cash,
      shortfall: amount - corp.cash,
    });
  }
}

// ============================================================
// Early warning: turns-to-bankruptcy estimate
// ============================================================

/**
 * Estimate how many turns remain before the player runs out of cash,
 * based on average net cash flow over the last N turns.
 *
 * Returns null if cash flow is positive (no risk) or if insufficient
 * history exists to make an estimate.
 */
export function estimateTurnsToBankruptcy(
  state: GameState,
  corporationId: string,
  lookbackTurns = 4
): number | null {
  const currentTurn = state.turn;
  if (currentTurn < lookbackTurns) return null;

  const corp = state.corporations[corporationId];
  if (!corp) return null;

  // Sum net cash flow per turn over the lookback window
  const turnFlows: number[] = [];

  for (let t = currentTurn - lookbackTurns; t < currentTurn; t++) {
    const flow = state.transactions
      .filter((tx) => tx.corporationId === corporationId && tx.turn === t)
      .reduce((sum, tx) => sum + tx.total, 0);
    turnFlows.push(flow);
  }

  const avgFlow = turnFlows.reduce((a, b) => a + b, 0) / turnFlows.length;

  // Only warn if average cash flow is negative (outflow)
  if (avgFlow >= 0) return null;

  const turnsRemaining = corp.cash / Math.abs(avgFlow);
  return Math.floor(turnsRemaining);
}
