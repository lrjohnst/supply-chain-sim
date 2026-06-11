import type { GameState, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { inventoryQuantity, removeFromInventory, clamp, sampleNormal } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment } from "./investments";
import { checkMilestones } from "./milestones";

// ============================================================
// Return type for snapshot recording
// ============================================================

export interface RetailTickData {
  /** firmId → productId → effective demand units this turn */
  effectiveDemand: Record<string, Partial<Record<ProductId, number>>>;
  /** firmId → productId → noise term this turn */
  demandNoiseTerm: Record<string, Partial<Record<ProductId, number>>>;
  /** Severity noise term added this turn (0 if no recession). */
  recessionNoiseTerm: number;
  /** Effective severity actually used this turn (0 if no recession). */
  recessionEffectiveSeverity: number;
}

// ============================================================
// Main entry point
// ============================================================

/** Run B2C retail sales for all stores. Returns tick data for snapshot. */
export function runRetailSales(state: GameState): RetailTickData {
  const tickData: RetailTickData = {
    effectiveDemand: {},
    demandNoiseTerm: {},
    recessionNoiseTerm: 0,
    recessionEffectiveSeverity: 0,
  };

  // ---- Recession tick ----
  let recessionDisplacementFraction = 0; // applied as: baseDemand * fraction (negative)

  if (state.recessionTurnsRemaining > 0) {
    // Wobble the severity slightly each turn
    const recCfg = GameConfig.recessionEvents;
    const severityNoise = sampleNormal(0, recCfg.severityNoiseStdDev);
    const effectiveSeverity = clamp(state.recessionSeverity + severityNoise, 0, 1);

    tickData.recessionNoiseTerm = severityNoise;
    tickData.recessionEffectiveSeverity = effectiveSeverity;

    // displacement fraction = severity - 1 (negative, reduces demand)
    recessionDisplacementFraction = effectiveSeverity - 1;

    state.recessionTurnsRemaining -= 1;
    if (state.recessionTurnsRemaining === 0) {
      // Recession just ended — start cooldown, clear severity
      state.recessionCooldownRemaining = GameConfig.recessionEvents.cooldownTurns;
      state.recessionSeverity = 0;
    }
  } else if (state.recessionCooldownRemaining > 0) {
    state.recessionCooldownRemaining -= 1;
  }

  // ---- Per-store retail ----
  for (const firm of Object.values(state.firms)) {
    if (firm.type !== "store") continue;

    const cityNode = state.cityNodes[firm.cityNodeId];
    if (!cityNode) continue;

    const corporation = state.corporations[firm.corporationId];
    const marketingMultiplier = computeMarketingMultiplier(
      corporation.marketingBudgetPerTurn
    );
    const barcodeMultiplier =
      state.barcodeAvailable && hasInvestment(firm, "barcode_scanning") ? 1.05 : 1.0;

    tickData.effectiveDemand[firm.id] = {};
    tickData.demandNoiseTerm[firm.id] = {};

    for (const product of getSellableProducts(firm)) {
      const available = inventoryQuantity(firm.inventory, product);
      if (available <= 0) {
        if (firm.salesRampTurns[product] !== undefined) {
          firm.salesRampTurns[product] = 0;
        }
        continue;
      }

      const benchmarkPrice = GameConfig.retailBenchmarkPrices[product];
      if (!benchmarkPrice || benchmarkPrice <= 0) continue;
      const retailPrice = firm.retailPrices[product] ?? benchmarkPrice;

      // Elasticity multiplier
      const elasticity = GameConfig.retailElasticity[product] ?? 0;
      const priceDeltaPct = ((retailPrice - benchmarkPrice) / benchmarkPrice) * 100;
      const elasticityMultiplier = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

      // Base demand
      const baseDemand = computeBaseDemand(cityNode.population, product);
      if (baseDemand <= 0) continue;

      // Sales ramp
      const rampTurns = getRampTurns(product);
      const currentRamp = firm.salesRampTurns[product] ?? 0;
      const rampFraction =
        rampTurns > 0
          ? Math.min(
              1,
              GameConfig.salesRamp.rampStartFraction +
                (1 - GameConfig.salesRamp.rampStartFraction) * (currentRamp / rampTurns)
            )
          : 1;

      // Multiplier-adjusted demand (before recession and noise)
      const adjustedDemand =
        baseDemand * elasticityMultiplier * rampFraction * marketingMultiplier * barcodeMultiplier;

      // Recession displacement (negative; 0 when no recession)
      const recessionDisplacement = baseDemand * recessionDisplacementFraction;

      // Permanent noise term — always drawn, regardless of recession
      const noise = sampleNormal(0, GameConfig.demand.noiseStdDev * baseDemand);

      // Effective demand — floor, minimum 0
      const effectiveDemand = Math.max(
        0,
        Math.floor(adjustedDemand + recessionDisplacement + noise)
      );

      tickData.effectiveDemand[firm.id][product as ProductId] = effectiveDemand;
      tickData.demandNoiseTerm[firm.id][product as ProductId] = noise;

      const sold = Math.min(available, effectiveDemand);
      if (sold <= 0) {
        firm.salesRampTurns[product] = currentRamp + 1;
        continue;
      }

      // Advance ramp
      firm.salesRampTurns[product] = currentRamp + 1;

      const { removed, unitCost } = removeFromInventory(firm.inventory, product, sold);
      if (removed <= 0) continue;

      const revenue = removed * retailPrice;
      corporation.cumulativeRevenue += revenue;

      postTransaction({
        state,
        turn: state.turn,
        firmId: firm.id,
        corporationId: firm.corporationId,
        category: "revenue",
        counterparty: "Retail consumers",
        product: product as ProductId,
        quantity: removed,
        unitPrice: retailPrice,
        total: revenue,
      });

      // COGS: P&L-only entry — cash already left when goods were purchased.
      if (unitCost > 0) {
        postTransaction({
          state,
          turn: state.turn,
          firmId: firm.id,
          corporationId: firm.corporationId,
          category: "input_cost",
          counterparty: "Cost of goods sold",
          product: product as ProductId,
          quantity: removed,
          unitPrice: unitCost,
          total: 0,
        });
      }

      checkMilestones(state, firm.corporationId);
    }
  }

  return tickData;
}

// ============================================================
// Helpers
// ============================================================

function getSellableProducts(
  firm: { investments: { type: string; status: string }[] }
): string[] {
  const products: string[] = [];
  const has = (t: string) =>
    firm.investments.some((i) => i.type === t && i.status === "complete");
  if (has("grocery_section"))
    products.push("chicken", "chicken_soup", "ice_cream_strawberry");
  if (has("electronics_section")) products.push("laptop_branded", "printer_branded");
  return products;
}

function computeBaseDemand(population: number, product: string): number {
  const perCapita = (
    GameConfig.consumerDemand.perCapitaDemand as Record<string, number>
  )[product];
  return perCapita ? Math.floor(population * perCapita) : 0;
}

function computeMarketingMultiplier(budgetPerTurn: number): number {
  return Math.min(
    1 + budgetPerTurn * GameConfig.marketing.demandMultiplierPerUnit,
    GameConfig.marketing.maxDemandMultiplier
  );
}

function getRampTurns(product: string): number {
  const electronics = ["laptop_branded", "printer_branded"];
  if (electronics.includes(product)) return GameConfig.salesRamp.rampTurns.electronics;
  return GameConfig.salesRamp.rampTurns.grocery;
}

/** Compute estimated demand at a node for a product at a given price. Used for UI hints. */
export function estimatedDemand(
  population: number,
  product: ProductId,
  retailPrice?: number
): number {
  const base = computeBaseDemand(population, product);
  if (base === 0) return 0;
  const benchmark = GameConfig.retailBenchmarkPrices[product];
  if (!benchmark || !retailPrice) return base;
  const elasticity = GameConfig.retailElasticity[product] ?? 0;
  const priceDeltaPct = ((retailPrice - benchmark) / benchmark) * 100;
  const elasticityMultiplier = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);
  return Math.floor(base * elasticityMultiplier);
}
