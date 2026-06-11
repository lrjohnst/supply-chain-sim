import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";

/**
 * Progression milestones — unlocks triggered by cumulative revenue.
 * These are NOT win conditions. They are gating mechanisms for features.
 *
 * Called from any subsystem that posts revenue (retail, tenders).
 * Safe to call multiple times — idempotent once unlocked.
 *
 * Post-MVP: additional milestones (supply chain maturity tiers,
 * business development unlocks, technology tree gates) live here.
 */
export function checkMilestones(state: GameState, corporationId: string): void {
  const corp = state.corporations[corporationId];
  if (!corp) return;

  // Multi-year contracts: unlocks at €100k cumulative revenue
  if (
    !corp.multiYearContractsUnlocked &&
    corp.cumulativeRevenue >= GameConfig.game.multiYearContractRevenueThreshold
  ) {
    corp.multiYearContractsUnlocked = true;
  }
}
