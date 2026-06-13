import type { GameState, ProductId, Firm } from "../types";
import { GameConfig } from "../config/gameConfig";
import { inventoryQuantity, removeFromInventory, clamp, sampleNormal } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment } from "./investments";
import { checkMilestones } from "./milestones";
import { getCityDemandMultiplier } from "./city";

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
// Ramp S-curve
// ============================================================

/**
 * Convert a ramp progress float into a demand multiplier using a logistic S-curve.
 *
 * f(progress) = 1 / (1 + exp(-kSteepness × (progress − midpointProgress))
 *
 * At progress=0:  ~10% of full demand
 * At progress=15: ~50% of full demand (midpoint)
 * At progress=25: ~80% of full demand
 * At progress=40: ~97% of full demand
 *
 * Exported for use in UI (market size percentage display).
 */
export function computeRampFraction(progress: number): number {
  const { kSteepness, midpointProgress } = GameConfig.salesRamp;
  return 1 / (1 + Math.exp(-kSteepness * (progress - midpointProgress)));
}

// ============================================================
// Main entry point
// ============================================================

/**
 * Run B2C retail sales for all stores. Returns tick data for snapshot.
 *
 * Demand calculation order per product per turn:
 *   1. Base demand (population × perCapitaDemandRate)
 *   2. Ramp fraction  (S-curve on salesRampProgress)
 *   3. Elasticity multiplier
 *   4. Marketing multiplier
 *   5. Barcode multiplier
 *   6. Recession displacement (applied on already-multiplied demand)
 *   7. Noise term (drawn last, proportional to post-recession demand)
 *
 * Ramp progress advances by unitsSold / fullRampDemand (0–1 per turn).
 * Zero inventory resets ramp progress to 0 (full stockout penalty).
 */
export function runRetailSales(state: GameState): RetailTickData {
  const tickData: RetailTickData = {
    effectiveDemand: {},
    demandNoiseTerm: {},
    recessionNoiseTerm: 0,
    recessionEffectiveSeverity: 0,
  };

  // ---- Recession tick ----
  let recessionSeverityThisTurn = 0; // 0 = no recession

  if (state.recessionTurnsRemaining > 0) {
    const recCfg        = GameConfig.recessionEvents;
    const severityNoise = sampleNormal(0, recCfg.severityNoiseStdDev);
    const effectiveSeverity = clamp(state.recessionSeverity + severityNoise, 0, 1);

    tickData.recessionNoiseTerm         = severityNoise;
    tickData.recessionEffectiveSeverity = effectiveSeverity;
    recessionSeverityThisTurn           = effectiveSeverity;

    state.recessionTurnsRemaining -= 1;
    if (state.recessionTurnsRemaining === 0) {
      state.recessionCooldownRemaining = GameConfig.recessionEvents.cooldownTurns;
      state.recessionSeverity          = 0;
    }
  } else if (state.recessionCooldownRemaining > 0) {
    state.recessionCooldownRemaining -= 1;
  }

  // ---- Per-store retail ----
  for (const firm of Object.values(state.firms)) {
    if (firm.type !== "store") continue;

    const cityNode = state.cityNodes[firm.cityNodeId];
    if (!cityNode) continue;

    const corporation       = state.corporations[firm.corporationId];
    const marketingMult     = computeMarketingMultiplier(corporation.marketingBudgetPerTurn);
    const barcodeMult       = state.barcodeAvailable && hasInvestment(firm, "barcode_scanning")
                               ? 1.05 : 1.0;

    tickData.effectiveDemand[firm.id] = {};
    tickData.demandNoiseTerm[firm.id] = {};

    for (const product of getSellableProducts(firm)) {
      const available = inventoryQuantity(firm.inventory, product);

      if (available <= 0) {
        // If harbor auto-source is enabled, zero inventory means harbor purchased
        // 0 units because deterministic demand was 0 (e.g. deep recession) — pause
        // the ramp rather than resetting it. The store is not at fault.
        // Without auto-source, zero inventory is a genuine stockout → full ramp reset.
        if (!firm.harborAutoSource[product as ProductId]) {
          firm.salesRampProgress[product] = 0;
        }
        continue;
      }

      const benchmarkPrice = GameConfig.retailBenchmarkPrices[product];
      if (!benchmarkPrice || benchmarkPrice <= 0) continue;
      const retailPrice = firm.retailPrices[product] ?? benchmarkPrice;

      // Step 1: Base demand (population × perCapita × city wealth multiplier)
      const baseDemand = Math.floor(
        computeBaseDemand(cityNode.population, product) * getCityDemandMultiplier(state, firm.cityNodeId)
      );
      if (baseDemand <= 0) continue;

      // Step 2: Ramp fraction
      const currentProgress = firm.salesRampProgress[product] ?? 0;
      const rampFraction    = computeRampFraction(currentProgress);

      // Step 3: Elasticity
      const elasticity      = GameConfig.retailElasticity[product] ?? 0;
      const priceDeltaPct   = ((retailPrice - benchmarkPrice) / benchmarkPrice) * 100;
      const elasticityMult  = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

      // Steps 2–5 combined
      const afterMultipliers = baseDemand * rampFraction * elasticityMult * marketingMult * barcodeMult;

      // Step 6: Recession displacement (on already-multiplied demand)
      const recessionDisplacement = recessionSeverityThisTurn > 0
        ? afterMultipliers * (recessionSeverityThisTurn - 1)  // negative
        : 0;
      const afterRecession = afterMultipliers + recessionDisplacement;

      // Step 7: Noise — proportional to post-recession demand magnitude
      const noise = sampleNormal(0, GameConfig.demand.noiseStdDev * Math.max(0, afterRecession));

      const effectiveDemand = Math.max(0, Math.floor(afterRecession + noise));

      tickData.effectiveDemand[firm.id][product as ProductId] = effectiveDemand;
      tickData.demandNoiseTerm[firm.id][product as ProductId] = noise;

      const sold = Math.min(available, effectiveDemand);

      // Ramp progress advancement — weighted by demand satisfaction
      // fullRampDemand = what demand would be at ramp=1 (without ramp fraction),
      // with all other multipliers including current recession state.
      const fullRampDemand = Math.max(
        1,
        Math.floor(baseDemand * elasticityMult * marketingMult * barcodeMult
          + (recessionSeverityThisTurn > 0
            ? baseDemand * elasticityMult * marketingMult * barcodeMult * (recessionSeverityThisTurn - 1)
            : 0))
      );
      // sold=0 but available>0 means we had stock but no buyers — advance by 0
      const progressAdvance = sold > 0 ? sold / fullRampDemand : 0;
      firm.salesRampProgress[product] = currentProgress + progressAdvance;

      if (sold <= 0) continue;

      const { removed, unitCost } = removeFromInventory(firm.inventory, product, sold);
      if (removed <= 0) continue;

      const revenue = removed * retailPrice;
      corporation.cumulativeRevenue += revenue;

      postTransaction({
        state,
        turn:          state.turn,
        firmId:        firm.id,
        corporationId: firm.corporationId,
        category:      "revenue",
        counterparty:  "Retail consumers",
        product:       product as ProductId,
        quantity:      removed,
        unitPrice:     retailPrice,
        total:         revenue,
      });

      if (unitCost > 0) {
        postTransaction({
          state,
          turn:          state.turn,
          firmId:        firm.id,
          corporationId: firm.corporationId,
          category:      "input_cost",
          counterparty:  "Cost of goods sold",
          product:       product as ProductId,
          quantity:      removed,
          unitPrice:     unitCost,
          total:         0,
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
  if (has("grocery_section"))     products.push("chicken", "chicken_soup", "ice_cream_strawberry");
  if (has("electronics_section")) products.push("laptop_branded", "printer_branded");
  return products;
}

function computeBaseDemand(population: number, product: string): number {
  const perCapita = (GameConfig.consumerDemand.perCapitaDemand as Record<string, number>)[product];
  return perCapita ? Math.floor(population * perCapita) : 0;
}

function computeMarketingMultiplier(budgetPerTurn: number): number {
  return Math.min(
    1 + budgetPerTurn * GameConfig.marketing.demandMultiplierPerUnit,
    GameConfig.marketing.maxDemandMultiplier
  );
}

/**
 * Market size: fully-ramped demand at the given price.
 * Applies elasticity only — no ramp, marketing, barcode, or recession.
 * Used for the UI "Market size" hint: the ceiling the player is growing toward.
 */
export function estimatedDemand(
  population: number,
  product: ProductId,
  retailPrice?: number
): number {
  const base = computeBaseDemand(population, product);
  if (base === 0) return 0;
  const benchmark = GameConfig.retailBenchmarkPrices[product];
  if (!benchmark || !retailPrice) return base;
  const elasticity    = GameConfig.retailElasticity[product] ?? 0;
  const priceDeltaPct = ((retailPrice - benchmark) / benchmark) * 100;
  const elasticityMult = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);
  return Math.floor(base * elasticityMult);
}

/**
 * Full deterministic demand for a firm/product this turn.
 * Follows the same order as runRetailSales (steps 1–6) but excludes the
 * noise term (step 7).
 *
 * Used by harborSpotPurchase to determine how many units to buy.
 * The actual sold quantity will differ slightly due to noise — this is a
 * known accepted simplification for MVP. Post-MVP: an inventory buffer
 * system will decouple purchase quantity from demand estimate.
 *
 * Recession: uses state.recessionSeverity directly (no per-turn severity
 * noise wobble). The wobble is only drawn inside runRetailSales. The slight
 * mismatch during recessions is intentionally excluded here and accepted.
 */
export function computeFullDeterministicDemand(
  state: GameState,
  firm: Firm,
  product: ProductId,
  retailPrice: number
): number {
  const cityNode = state.cityNodes[firm.cityNodeId];
  if (!cityNode) return 0;

  const base = computeBaseDemand(cityNode.population, product);
  if (base <= 0) return 0;

  const benchmark = GameConfig.retailBenchmarkPrices[product];
  if (!benchmark || benchmark <= 0) return 0;

  const corp = state.corporations[firm.corporationId];

  // Step 2: Ramp
  const progress     = firm.salesRampProgress[product] ?? 0;
  const rampFraction = computeRampFraction(progress);

  // Step 3: Elasticity
  const elasticity     = GameConfig.retailElasticity[product] ?? 0;
  const priceDeltaPct  = ((retailPrice - benchmark) / benchmark) * 100;
  const elasticityMult = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

  // Steps 4–5: Marketing + barcode
  const marketingMult = computeMarketingMultiplier(corp.marketingBudgetPerTurn);
  const barcodeMult   = state.barcodeAvailable &&
    firm.investments.some((i) => i.type === "barcode_scanning" && i.status === "complete")
    ? 1.05 : 1.0;

  // Steps 2–5 combined
  const afterMultipliers = base * rampFraction * elasticityMult * marketingMult * barcodeMult;

  // Step 6: Recession displacement (deterministic severity, no noise wobble)
  const recessionDisplacement = state.recessionTurnsRemaining > 0
    ? afterMultipliers * (state.recessionSeverity - 1)
    : 0;

  return Math.max(0, Math.floor(afterMultipliers + recessionDisplacement));
}
