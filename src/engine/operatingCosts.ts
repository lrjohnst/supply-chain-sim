import type { GameState, Firm } from "../types";
import { GameConfig } from "../config/gameConfig";
import { postTransaction } from "./ledger";
import { requireCash, eliminateCorporation } from "./bankruptcy";

/** Operating cost for a firm = sum of operatingCostPerTurn for each COMPLETED investment. */
export function firmOperatingCost(firm: Firm): number {
  return firm.investments
    .filter((i) => i.status === "complete")
    .reduce((sum, inv) => sum + GameConfig.investments.operatingCostPerTurn[inv.type], 0);
}

/**
 * Additional startup cost for any production lines currently commissioning.
 * Cost per line = normal production_line operating cost × startupCostFraction.
 * Direct P&L expense, not capitalised.
 */
export function firmStartupCost(firm: Firm): number {
  const normalOpCost   = GameConfig.investments.operatingCostPerTurn["production_line"];
  const fraction       = GameConfig.investments.startupCostFraction;
  const startingUpCount = firm.productionLines.filter(
    (l) => l.lineStatus === "starting_up"
  ).length;
  return startingUpCount * normalOpCost * fraction;
}

/** Deduct per-firm operating costs, training, and corporate marketing budget. */
export function deductOperatingCosts(state: GameState): void {
  for (const corp of Object.values(state.corporations)) {
    if (corp.eliminated) continue;

    // Training budget
    if (corp.trainingBudgetPerTurn > 0) {
      if (corp.isPlayer) requireCash(corp, corp.trainingBudgetPerTurn, "Training budget");
      else if (corp.cash < corp.trainingBudgetPerTurn) { eliminateCorporation(state, corp.id); continue; }
      postTransaction({
        state,
        turn: state.turn,
        firmId: null,
        corporationId: corp.id,
        category: "training_cost",
        counterparty: "Training programs",
        product: null,
        quantity: null,
        unitPrice: null,
        total: -corp.trainingBudgetPerTurn,
      });
    }

    // Marketing budget
    if (corp.marketingBudgetPerTurn > 0) {
      if (corp.isPlayer) requireCash(corp, corp.marketingBudgetPerTurn, "Marketing budget");
      else if (corp.cash < corp.marketingBudgetPerTurn) { eliminateCorporation(state, corp.id); continue; }
      postTransaction({
        state,
        turn: state.turn,
        firmId: null,
        corporationId: corp.id,
        category: "marketing_cost",
        counterparty: "Marketing",
        product: null,
        quantity: null,
        unitPrice: null,
        total: -corp.marketingBudgetPerTurn,
      });
    }

    // Per-firm operating costs (scales with investments)
    for (const firmId of corp.firmIds) {
      const firm        = state.firms[firmId];
      const opCost      = firmOperatingCost(firm);
      const startupCost = firmStartupCost(firm);
      const totalCost   = opCost + startupCost;
      if (totalCost <= 0) continue;

      if (corp.isPlayer) requireCash(corp, totalCost, `Operating costs — ${firm.name}`);
      else if (corp.cash < totalCost) { eliminateCorporation(state, corp.id); break; }

      if (opCost > 0) {
        postTransaction({
          state,
          turn: state.turn,
          firmId: firm.id,
          corporationId: corp.id,
          category: "operating_cost",
          counterparty: "Operations",
          product: null,
          quantity: null,
          unitPrice: null,
          total: -opCost,
        });
      }

      if (startupCost > 0) {
        postTransaction({
          state,
          turn: state.turn,
          firmId: firm.id,
          corporationId: corp.id,
          category: "operating_cost",
          counterparty: "Commissioning",
          product: null,
          quantity: null,
          unitPrice: null,
          total: -startupCost,
        });
      }
    }
  }
}

/** Update firm quality based on training budget and quality lab. */
export function updateQuality(state: GameState): void {
  const cfg = GameConfig.quality;

  for (const corp of Object.values(state.corporations)) {
    const firmsCount = corp.firmIds.length;
    if (firmsCount === 0) continue;

    const budgetPerFirm = corp.trainingBudgetPerTurn / firmsCount;
    const trainingActive = budgetPerFirm >= GameConfig.training.budgetPerFirmForEffect;

    for (const firmId of corp.firmIds) {
      const firm = state.firms[firmId];
      const hasLab = firm.investments.some(
        (i) => i.type === "quality_lab" && i.status === "complete"
      );

      if (hasLab) firm.quality = Math.min(1, firm.quality + cfg.qualityGainPerTurnWithLab);
      if (trainingActive) firm.quality = Math.min(1, firm.quality + cfg.qualityGainFromTraining);
      else firm.quality = Math.max(0, firm.quality - cfg.qualityDecayWithoutTraining);
    }
  }
}
