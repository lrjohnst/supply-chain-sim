/**
 * history.ts — rolling economic history system.
 *
 * Appends one EconomicSnapshot per turn to state.economicHistory,
 * trimming to the configured rolling window.
 *
 * Snapshot is written at the end of the tick (before turn increment)
 * so snapshot.turn == the turn that was just processed.
 */

import type { GameState, EconomicSnapshot, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { getBasePrice, getHarborSoldProducts } from "./harbor";
import { corporationNetWorth } from "./utils";
import type { HarborTickData } from "./harbor";
import type { RetailTickData } from "./retail";

export function appendSnapshot(
  state: GameState,
  harborData: HarborTickData,
  retailData: RetailTickData
): void {
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  const aiCorp = Object.values(state.corporations).find((c) => !c.isPlayer);

  // Current interest rate: average of all active loan rates.
  // Falls back to config base rate if no loans exist.
  const allLoans = Object.values(state.loans);
  const currentInterestRate =
    allLoans.length > 0
      ? allLoans.reduce((s, l) => s + l.annualInterestRate, 0) / allLoans.length
      : GameConfig.loans.baseAnnualInterestRate;

  // Active shock summaries
  const k = GameConfig.commodityShockEvents.kSteepness;
  const activeShocks: EconomicSnapshot["activeShocks"] = state.activeHarborShocks.map((shock) => {
    const midpoint = shock.normalizationDuration / 2;
    const progress = 1 / (1 + Math.exp(-k * (shock.turnsElapsed - midpoint)));
    const displacement = (shock.shockedPrice - shock.basePrice) * (1 - progress);
    return {
      productId: shock.productId,
      turnsElapsed: shock.turnsElapsed,
      normalizationDuration: shock.normalizationDuration,
      sCurveProgress: +progress.toFixed(3),
      displacement: +displacement.toFixed(4),
    };
  });

  // Harbor base prices snapshot (only sold products)
  const harborBasePrices: Partial<Record<ProductId, number>> = {};
  for (const p of getHarborSoldProducts()) {
    harborBasePrices[p] = getBasePrice(p);
  }

  const snapshot: EconomicSnapshot = {
    turn: state.turn,
    harborPrices: { ...state.harborNode.prices },
    harborBasePrices,
    harborShockDisplacements: harborData.shockDisplacement,
    harborNoiseTerm: harborData.noiseTerm,
    effectiveDemand: retailData.effectiveDemand,
    demandNoiseTerm: retailData.demandNoiseTerm,
    recessionSeverity: state.recessionSeverity,
    recessionNoiseTerm: retailData.recessionNoiseTerm,
    recessionEffectiveSeverity: retailData.recessionEffectiveSeverity,
    activeShocks,
    currentInterestRate,
    playerNetWorth: playerCorp ? corporationNetWorth(state, playerCorp.id) : 0,
    aiNetWorth: aiCorp ? corporationNetWorth(state, aiCorp.id) : 0,
    playerCash: playerCorp?.cash ?? 0,
    aiCash: aiCorp?.cash ?? 0,
  };

  state.economicHistory.push(snapshot);

  const window = GameConfig.history.rollingWindowTurns;
  if (state.economicHistory.length > window) {
    state.economicHistory.splice(0, state.economicHistory.length - window);
  }
}
