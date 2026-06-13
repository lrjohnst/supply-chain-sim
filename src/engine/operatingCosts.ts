import type { GameState, Firm, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { postTransaction } from "./ledger";
import { requireCash, eliminateCorporation } from "./bankruptcy";

/** Flat overhead for every firm, regardless of investments or activity. */
export function firmBaseOverhead(firm: Firm): number {
  return GameConfig.firmBaseOverhead[firm.type] ?? 0;
}

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
  const normalOpCost    = GameConfig.investments.operatingCostPerTurn["production_line"];
  const fraction        = GameConfig.investments.startupCostFraction;
  const startingUpCount = firm.productionLines.filter(
    (l) => l.lineStatus === "starting_up"
  ).length;
  return startingUpCount * normalOpCost * fraction;
}

/**
 * Deduct per-firm and corporate costs in the following order:
 *   1. Firm base overhead (unavoidable rent/utilities/security)
 *   2. Firm investment operating costs
 *   3. Firm startup commissioning costs
 *   4. Training budget  (discretionary)
 *   5. Marketing budget (discretionary)
 *
 * Unavoidable costs come first so a player goes bankrupt on real obligations,
 * not discretionary spend.
 */
export function deductOperatingCosts(state: GameState): void {
  for (const corp of Object.values(state.corporations)) {
    if (corp.eliminated) continue;

    // ---- 1-3: Per-firm costs (overhead → investment op costs → startup) ----
    for (const firmId of corp.firmIds) {
      const firm       = state.firms[firmId];
      const overhead   = firmBaseOverhead(firm);
      const opCost     = firmOperatingCost(firm);
      const startupCost = firmStartupCost(firm);

      // Overhead
      if (overhead > 0) {
        if (corp.isPlayer) {
          requireCash(corp, overhead, `Base overhead — ${firm.name}`);
        } else if (corp.cash < overhead) {
          state.pendingNotifications.push(
            `Your competitor ${corp.name} has gone bankrupt and been eliminated from the game.`
          );
          eliminateCorporation(state, corp.id);
          break;
        }
        corp.cash -= overhead;
        postTransaction({
          state,
          turn:          state.turn,
          firmId:        firm.id,
          corporationId: corp.id,
          category:      "overhead",
          counterparty:  "Fixed overhead",
          product:       null,
          quantity:      null,
          unitPrice:     null,
          total:         -overhead,
        });
      }

      if (corp.eliminated) break;

      // Investment operating costs
      if (opCost > 0) {
        if (corp.isPlayer) {
          requireCash(corp, opCost, `Operating costs — ${firm.name}`);
        } else if (corp.cash < opCost) {
          state.pendingNotifications.push(
            `Your competitor ${corp.name} has gone bankrupt and been eliminated from the game.`
          );
          eliminateCorporation(state, corp.id);
          break;
        }
        postTransaction({
          state,
          turn:          state.turn,
          firmId:        firm.id,
          corporationId: corp.id,
          category:      "operating_cost",
          counterparty:  "Operations",
          product:       null,
          quantity:      null,
          unitPrice:     null,
          total:         -opCost,
        });
      }

      if (corp.eliminated) break;

      // Startup commissioning costs
      if (startupCost > 0) {
        if (corp.isPlayer) {
          requireCash(corp, startupCost, `Commissioning — ${firm.name}`);
        } else if (corp.cash < startupCost) {
          state.pendingNotifications.push(
            `Your competitor ${corp.name} has gone bankrupt and been eliminated from the game.`
          );
          eliminateCorporation(state, corp.id);
          break;
        }
        postTransaction({
          state,
          turn:          state.turn,
          firmId:        firm.id,
          corporationId: corp.id,
          category:      "operating_cost",
          counterparty:  "Commissioning",
          product:       null,
          quantity:      null,
          unitPrice:     null,
          total:         -startupCost,
        });
      }

      if (corp.eliminated) break;
    }

    if (corp.eliminated) continue;

    // ---- 4: Per-firm training costs (discretionary, per-firm intensity) ----
    for (const firmId of corp.firmIds) {
      if (corp.eliminated) break;
      const firm = state.firms[firmId];
      const baseCost = GameConfig.training.baseTrainingCostPerTurn[firm.type] ?? 0;
      const trainingCost = baseCost * (firm.trainingIntensity / 100);
      if (trainingCost <= 0) continue;

      if (corp.isPlayer) {
        requireCash(corp, trainingCost, `Training — ${firm.name}`);
      } else if (corp.cash < trainingCost) {
        state.pendingNotifications.push(
          `Your competitor ${corp.name} has gone bankrupt and been eliminated from the game.`
        );
        eliminateCorporation(state, corp.id);
        break;
      }
      corp.cash -= trainingCost;
      postTransaction({
        state,
        turn:          state.turn,
        firmId:        firm.id,
        corporationId: corp.id,
        category:      "training_cost",
        counterparty:  "Training programs",
        product:       null,
        quantity:      null,
        unitPrice:     null,
        total:         -trainingCost,
      });
    }

    if (corp.eliminated) continue;

    // ---- 5: Marketing budget (discretionary) ----
    if (corp.marketingBudgetPerTurn > 0) {
      if (corp.isPlayer) {
        requireCash(corp, corp.marketingBudgetPerTurn, "Marketing budget");
      } else if (corp.cash < corp.marketingBudgetPerTurn) {
        state.pendingNotifications.push(
          `Your competitor ${corp.name} has gone bankrupt and been eliminated from the game.`
        );
        eliminateCorporation(state, corp.id);
        continue;
      }
      postTransaction({
        state,
        turn:          state.turn,
        firmId:        null,
        corporationId: corp.id,
        category:      "marketing_cost",
        counterparty:  "Marketing",
        product:       null,
        quantity:      null,
        unitPrice:     null,
        total:         -corp.marketingBudgetPerTurn,
      });
    }
  }
}

/**
 * Update production line quality for all non-store firms.
 *
 * Rules per production line per turn:
 *   - quality_lab complete on parent firm: +qualityGainPerTurnWithLab, capped at 1.0
 *   - Training budget meets threshold:     +qualityGainFromTraining, capped at 1.0
 *   - Training below threshold:            -qualityDecayWithoutTraining, floored at 0.0
 *
 * Stores have no quality mechanic.
 * TODO Post-MVP: store sections get their own quality score affecting
 * customer satisfaction and repeat visits.
 */
export function updateQuality(state: GameState): void {
  const cfg = GameConfig.quality;
  const trainingCfg = GameConfig.training;

  for (const corp of Object.values(state.corporations)) {
    for (const firmId of corp.firmIds) {
      const firm = state.firms[firmId];

      // Stores have no production quality mechanic.
      if (firm.type === "store") continue;

      const hasLab = firm.investments.some(
        (i) => i.type === "quality_lab" && i.status === "complete"
      );
      const trainingActive = firm.trainingIntensity >= trainingCfg.qualityThreshold;

      for (const line of firm.productionLines) {
        if (hasLab)          line.quality = Math.min(1, line.quality + cfg.qualityGainPerTurnWithLab);
        if (trainingActive)  line.quality = Math.min(1, line.quality + cfg.qualityGainFromTraining);
        else                 line.quality = Math.max(0, line.quality - cfg.qualityDecayWithoutTraining);
      }
    }
  }
}

/**
 * Find the quality of the production line in `firm` whose recipe produces `product`.
 * Falls back to 1.0 if no matching line exists (e.g. goods sourced externally).
 */
export function getProductionLineQuality(firm: Firm, product: ProductId): number {
  for (const line of firm.productionLines) {
    if (!line.recipe) continue;
    const recipeCfg = GameConfig.production[line.recipe];
    if (recipeCfg.outputProduct === product) return line.quality;
  }
  return 1.0; // no matching line — treat as full quality (externally sourced)
}
