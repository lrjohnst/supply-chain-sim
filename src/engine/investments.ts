import type { GameState, Firm, Investment, InvestmentType, RecipeKey } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";
import { postTransaction } from "./ledger";

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
 * Advance all investments and production line startup phases.
 * Called at step 3 of the tick, before production.
 *
 * Investment lifecycle:
 *   queued → in_progress (first payment taken same tick)
 *   in_progress → complete (one payment per turn; pauses if cash insufficient)
 *
 * When a production_line investment completes, an unconfigured ProductionLineSetup
 * is automatically added to firm.productionLines.
 *
 * Production line startup (separate state machine on ProductionLineSetup):
 *   starting_up → active (decrements each turn)
 *
 * Returns player investment pauses for notification.
 * AI pauses are silent.
 */
export function advanceInvestments(state: GameState): PausedInvestmentInfo[] {
  const paused: PausedInvestmentInfo[] = [];

  for (const firm of Object.values(state.firms)) {
    const corp = state.corporations[firm.corporationId];

    for (const inv of firm.investments) {

      // ---- queued → in_progress (first payment taken this same tick) ----
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
          if (corp.isPlayer) {
            paused.push({ firmId: firm.id, firmName: firm.name, investmentType: inv.type });
          }
          continue; // pause — no progress, no payment
        }

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
          inv.status         = "complete";
          inv.turnsRemaining = 0;

          // Production lines: add an unconfigured line setup for the player to configure.
          if (inv.type === "production_line") {
            firm.productionLines.push({
              investmentId:          inv.id,
              recipe:                null,
              pendingRecipe:         null,
              sourceType:            "harbor",
              lineStatus:            "unconfigured",
              startupTurnsRemaining: 0,
              progress:              0,
              intentionallyIdle:     false,
              quality:               GameConfig.investments.productionLineBaseQuality,
            });
          }
        }
      }
    }

    // ---- Production line pending recipe changes + startup advancement ----
    for (const line of firm.productionLines) {
      // Apply queued recipe change before production runs this tick.
      // Current turn's production already ran with the old recipe (last tick).
      if (line.pendingRecipe !== null) {
        line.recipe                = line.pendingRecipe;
        line.pendingRecipe         = null;
        line.lineStatus            = "starting_up";
        line.startupTurnsRemaining = GameConfig.investments.productionLineStartupTurns;
        line.progress              = 0;
        line.intentionallyIdle     = false;
      }

      if (line.lineStatus === "starting_up") {
        line.startupTurnsRemaining -= 1;
        if (line.startupTurnsRemaining <= 0) {
          line.lineStatus            = "active";
          line.startupTurnsRemaining = 0;
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
 * Queue a new investment on a firm. No payment taken.
 * Returns error string on failure, null on success.
 */
export function startInvestment(
  state: GameState,
  firmId: string,
  type: InvestmentType
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  // ---- Firm-type compatibility ----
  const validForFirm = (GameConfig.validInvestments[firm.type] as InvestmentType[]);
  if (!validForFirm.includes(type)) {
    return `${type.replace(/_/g, " ")} is not a valid investment for a ${firm.type}.`;
  }

  // ---- Slot limit (all statuses consume a slot) ----
  if (firm.investments.length >= GameConfig.firmInvestmentSlotLimit) {
    return "No investment slots remaining in this firm.";
  }

  // ---- Max-per-firm ----
  const existingCount = firm.investments.filter((i) => i.type === type).length;
  if (existingCount >= GameConfig.investments.maxPerFirm[type]) {
    return `Maximum number of ${type.replace(/_/g, " ")} investments already built.`;
  }

  // ---- Barcode gate ----
  if (type === "barcode_scanning" && !state.barcodeAvailable) {
    return "Barcode scanning is not yet available.";
  }

  firm.investments.push({
    id:               generateId(),
    type,
    status:           "queued",
    turnsRemaining:   GameConfig.investments.buildTurns[type],
    costPaid:         0,
    intentionallyIdle: false,
  });

  return null;
}

// ============================================================
// Cancel an investment
// ============================================================

/**
 * Cancel a queued or in_progress investment. Sunk payments are not refunded.
 * complete investments cannot be cancelled.
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
  if (inv.status === "complete") return "Cannot cancel a completed investment.";

  firm.investments.splice(idx, 1);

  if (inv.type === "production_line") {
    firm.productionLines = firm.productionLines.filter(
      (pl) => pl.investmentId !== inv.id
    );
  }

  return null;
}

// ============================================================
// Configure / manage production lines
// ============================================================

/**
 * Assign a recipe to a completed production line.
 * Begins the startup phase. If the line was already active, restarts startup.
 * Returns error string on failure, null on success.
 */
export function configureProductionLine(
  state: GameState,
  firmId: string,
  investmentId: string,
  recipe: RecipeKey
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  const inv = firm.investments.find(
    (i) => i.id === investmentId && i.type === "production_line"
  );
  if (!inv) return "Production line investment not found.";
  if (inv.status !== "complete") return "Production line is not yet built.";

  let line = firm.productionLines.find((l) => l.investmentId === investmentId);
  if (!line) {
    // Guard: should have been created when investment completed
    line = {
      investmentId,
      recipe:                null,
      pendingRecipe:         null,
      sourceType:            "harbor",
      lineStatus:            "unconfigured",
      startupTurnsRemaining: 0,
      progress:              0,
      intentionallyIdle:     false,
      quality:               GameConfig.investments.productionLineBaseQuality,
    };
    firm.productionLines.push(line);
  }

  if (line.lineStatus === "active") {
    // Active line: queue the change. Current recipe keeps running this turn.
    // pendingRecipe is applied at the start of the next tick in advanceInvestments.
    line.pendingRecipe = recipe;
  } else {
    // Unconfigured or starting_up: apply immediately, restart startup.
    line.recipe                = recipe;
    line.pendingRecipe         = null;
    line.lineStatus            = "starting_up";
    line.startupTurnsRemaining = GameConfig.investments.productionLineStartupTurns;
    line.progress              = 0;
    line.intentionallyIdle     = false;
  }

  return null;
}

/**
 * Cancel a queued recipe change on an active production line.
 * The current recipe continues uninterrupted.
 */
export function cancelPendingRecipeChange(
  state: GameState,
  firmId: string,
  investmentId: string
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";
  const line = firm.productionLines.find((l) => l.investmentId === investmentId);
  if (!line) return "Production line not found.";
  if (line.pendingRecipe === null) return "No pending recipe change to cancel.";
  line.pendingRecipe = null;
  return null;
}

/**
 * Mark a completed store section investment as intentionally idle.
 * Suppresses the unconfigured gate permanently until sourcing/pricing is set.
 */
export function markSectionIntentionallyIdle(
  state: GameState,
  firmId: string,
  investmentId: string
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";
  const inv = firm.investments.find((i) => i.id === investmentId);
  if (!inv) return "Investment not found.";
  inv.intentionallyIdle = true;
  return null;
}

/**
 * Mark a production line as intentionally idle.
 * Suppresses the unconfigured gate permanently until the player configures a recipe.
 */
export function markLineIntentionallyIdle(
  state: GameState,
  firmId: string,
  investmentId: string
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  const line = firm.productionLines.find((l) => l.investmentId === investmentId);
  if (!line) return "Production line not found.";

  line.intentionallyIdle = true;
  return null;
}

// ============================================================
// Read helpers
// ============================================================

/** True only when the investment is fully complete. */
export function hasInvestment(firm: Firm, type: InvestmentType): boolean {
  return firm.investments.some((i) => i.type === type && i.status === "complete");
}

/** Count of fully complete investments of a given type. */
export function countInvestment(firm: Firm, type: InvestmentType): number {
  return firm.investments.filter((i) => i.type === type && i.status === "complete").length;
}
