import type { GameState, Firm, Investment, InvestmentType } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";
import { postTransaction } from "./ledger";
import { displayName as productDisplayName } from "./products";

// TODO Post-MVP: End Turn gate prompt when investment completes and firm has no queued successor.

// ============================================================
// Types
// ============================================================

export interface PausedInvestmentInfo {
  firmId: string;
  firmName: string;
  investmentType: InvestmentType;
}

// ============================================================
// Per-turn advancement
// ============================================================

/**
 * Advance all investments by one turn. Called at step 3 of the tick.
 *
 * Lifecycle per investment this tick:
 *   queued      → in_progress (automatic; first payment taken same tick)
 *   in_progress → in_progress (payment deducted; turnsRemaining decremented)
 *               → starting_up (when turnsRemaining reaches 0; production lines only)
 *               → complete    (when turnsRemaining reaches 0; non-production-line)
 *               → paused for this tick if cash insufficient (no progress, no payment)
 *   starting_up → starting_up (turnsRemaining decremented; no payment)
 *               → complete    (when turnsRemaining reaches 0)
 *
 * Returns information about any player investments that paused due to
 * insufficient funds, so tick.ts can surface them as notifications.
 * AI pauses are silent.
 */
export function advanceInvestments(state: GameState): PausedInvestmentInfo[] {
  const paused: PausedInvestmentInfo[] = [];

  for (const firm of Object.values(state.firms)) {
    const corp = state.corporations[firm.corporationId];

    for (const inv of firm.investments) {

      // ---- queued → in_progress (then fall through to take first payment) ----
      if (inv.status === "queued") {
        inv.status = "in_progress";
      }

      // ---- in_progress: take payment, advance ----
      if (inv.status === "in_progress") {
        const totalCost  = GameConfig.investments.cost[inv.type];
        const buildTurns = GameConfig.investments.buildTurns[inv.type];

        // Last payment pays the exact remainder to avoid rounding drift.
        const perTurnPayment = inv.turnsRemaining === 1
          ? +(totalCost - inv.costPaid).toFixed(2)
          : Math.round((totalCost / buildTurns) * 100) / 100;

        if (corp.cash < perTurnPayment) {
          // Insufficient funds — pause this turn (no progress, no payment).
          if (corp.isPlayer) {
            paused.push({
              firmId:         firm.id,
              firmName:       firm.name,
              investmentType: inv.type,
            });
          }
          continue;
        }

        // Deduct payment via ledger (also adjusts corp.cash).
        postTransaction({
          state,
          turn:          state.turn,
          firmId:        firm.id,
          corporationId: firm.corporationId,
          category:      "investment_cost",
          counterparty:  "Capital expenditure",
          product:       null,
          quantity:      null,
          unitPrice:     null,
          total:         -perTurnPayment,
        });

        inv.costPaid       += perTurnPayment;
        inv.turnsRemaining -= 1;

        if (inv.turnsRemaining <= 0) {
          if (inv.type === "production_line") {
            // Production lines commission before going active.
            inv.status         = "starting_up";
            inv.turnsRemaining = GameConfig.investments.productionLineStartupTurns;
          } else {
            inv.status         = "complete";
            inv.turnsRemaining = 0;
          }
        }
        continue;
      }

      // ---- starting_up: count down, no payments ----
      if (inv.status === "starting_up") {
        inv.turnsRemaining -= 1;
        if (inv.turnsRemaining <= 0) {
          inv.status         = "complete";
          inv.turnsRemaining = 0;
        }
      }
    }
  }

  return paused;
}

// ============================================================
// Start a new investment
// ============================================================

/**
 * Queue a new investment on a firm.
 * No payment is taken. The investment can be cancelled penalty-free while queued.
 * Returns an error string on failure, null on success.
 */
export function startInvestment(
  state: GameState,
  firmId: string,
  type: InvestmentType
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  const corp = state.corporations[firm.corporationId];

  // ---- Firm-type compatibility ----
  const validForFirm = (GameConfig.validInvestments[firm.type] as InvestmentType[]);
  if (!validForFirm.includes(type)) {
    return `${type.replace(/_/g, " ")} is not a valid investment for a ${firm.type}.`;
  }

  // ---- Slot limit (queued + in_progress + starting_up + complete all consume slots) ----
  if (firm.investments.length >= GameConfig.firmInvestmentSlotLimit) {
    return "No investment slots remaining in this firm.";
  }

  // ---- Max-per-firm ----
  const maxAllowed   = GameConfig.investments.maxPerFirm[type];
  const existingCount = firm.investments.filter((i) => i.type === type).length;
  if (existingCount >= maxAllowed) {
    return `Maximum number of ${type.replace(/_/g, " ")} investments already built.`;
  }

  // ---- Barcode gate ----
  if (type === "barcode_scanning" && !state.barcodeAvailable) {
    return "Barcode scanning is not yet available.";
  }

  const inv: Investment = {
    id:             generateId(),
    type,
    status:         "queued",
    turnsRemaining: GameConfig.investments.buildTurns[type],
    costPaid:       0,   // payments begin when the investment transitions to in_progress
  };

  firm.investments.push(inv);
  return null;
}

// ============================================================
// Cancel an investment
// ============================================================

/**
 * Cancel a queued or in_progress investment. Sunk payments are not refunded.
 * starting_up and complete investments cannot be cancelled.
 * Returns an error string on failure, null on success.
 */
export function cancelInvestment(
  state: GameState,
  firmId: string,
  investmentId: string
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  const idx = firm.investments.findIndex((i) => i.id === investmentId);
  if (idx === -1) return "Investment not found.";

  const inv = firm.investments[idx];

  if (inv.status === "starting_up") {
    return "Cannot cancel: investment is commissioning. All payments are complete.";
  }
  if (inv.status === "complete") {
    return "Cannot cancel a completed investment.";
  }

  firm.investments.splice(idx, 1);

  // Remove associated production line config if applicable.
  if (inv.type === "production_line") {
    firm.productionLines = firm.productionLines.filter(
      (pl) => pl.investmentId !== inv.id
    );
  }

  return null;
}

// ============================================================
// Read helpers
// ============================================================

/** True only if the investment is fully complete and active. */
export function hasInvestment(firm: Firm, type: InvestmentType): boolean {
  return firm.investments.some((i) => i.type === type && i.status === "complete");
}

/** Count of fully complete investments of a given type. */
export function countInvestment(firm: Firm, type: InvestmentType): number {
  return firm.investments.filter((i) => i.type === type && i.status === "complete").length;
}
