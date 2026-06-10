import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";
import { postTransaction } from "./ledger";

/** Deduct per-firm operating costs, training, and corporate marketing budget. */
export function deductOperatingCosts(state: GameState): void {
  for (const corp of Object.values(state.corporations)) {
    // Training budget
    if (corp.trainingBudgetPerTurn > 0) {
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

    // Per-firm operating costs
    for (const firmId of corp.firmIds) {
      const firm = state.firms[firmId];
      const baseCost = GameConfig.firmOperatingCosts[firm.type];

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
        total: -baseCost,
      });
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

      if (hasLab) {
        firm.quality = Math.min(1, firm.quality + cfg.qualityGainPerTurnWithLab);
      }

      if (trainingActive) {
        firm.quality = Math.min(1, firm.quality + cfg.qualityGainFromTraining);
      } else {
        firm.quality = Math.max(0, firm.quality - cfg.qualityDecayWithoutTraining);
      }
    }
  }
}
