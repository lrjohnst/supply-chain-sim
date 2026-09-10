import type { GameState, ProductId, Firm, InvestmentType } from "../types";
import { GameConfig } from "../config/gameConfig";
import { inventoryQuantity, removeFromInventory, clamp, sampleNormal } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment } from "./investments";
import { checkMilestones } from "./milestones";
import { getCityDemandMultiplier, getWealthElasticityAdjustment } from "./city";
import { STORE_SECTION_PRODUCTS } from "./products";

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
// TODO: Utilization system redesign
// The current capacity model derives maxThroughput from fullRampDemand, making capacity
// always conveniently equal to demand at 100% training. This is unrealistic.
//
// Desired behavior:
// 1. Store capacity is determined independently of demand: by store size, employee count,
//    and trainedFraction. A small store on an A-location cannot serve all customers even
//    at 100% training. A large store on a C-location may have more capacity than customers.
//
// 2. City-wide demand pool per product: multiple stores in the same city compete for the
//    same demand pool. If player store fills 60% and competitor fills 30%, only 10% remains
//    unserved. Stores should draw from a shared city-level demand, not each calculate
//    independently as if the full market is available to them alone.
//
// 3. Overcapacity is a real cost: a store with more throughput capacity than demand wastes
//    staff investment. The player should feel this through staff wages with no corresponding
//    revenue benefit.
//
// See /docs/spec/roadmap/utilization-redesign.md for full specification.
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
    firm.utilizationPerSlot   = {};
    firm.capacityLimitedSlot  = {};

    for (const [sectionType, sectionProducts] of Object.entries(STORE_SECTION_PRODUCTS)) {
      if (!hasInvestment(firm, sectionType as InvestmentType)) continue;

      for (const product of sectionProducts!) {
        const available = inventoryQuantity(firm.inventory, product);

        if (available <= 0) {
          // Harbor auto-source: 0 inventory means demand was 0 this turn — pause ramp.
          // No auto-source: genuine stockout → reset ramp.
          if (!firm.harborAutoSource[product]) {
            firm.salesRampProgress[product] = 0;
          }
          continue;
        }

        const benchmarkPrice = GameConfig.retailBenchmarkPrices[product];
        if (!benchmarkPrice || benchmarkPrice <= 0) continue;
        const retailPrice = firm.retailPrices[product] ?? benchmarkPrice;

        // Step 1: Base demand
        const rawBase = computeBaseDemand(cityNode.population, product) * getCityDemandMultiplier(state, firm.cityNodeId);
        const locMult  = GameConfig.storeSlots.locationMultiplier[firm.locationClass];
        const sizeMult = GameConfig.storeSlots.sizeMultiplier[firm.size];
        const baseDemand = Math.floor(rawBase * locMult * sizeMult);
        if (baseDemand <= 0) continue;

        // Step 3: Elasticity
        const configElasticity = GameConfig.retailElasticity[product] ?? 0;
        const elasticityScale  = GameConfig.storeSlots.elasticityScaling[firm.locationClass];
        const wealthAdj        = getWealthElasticityAdjustment(cityNode);
        const elasticity       = configElasticity * elasticityScale * wealthAdj;
        const priceDeltaPct    = ((retailPrice - benchmarkPrice) / benchmarkPrice) * 100;
        const elasticityMult   = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

        // fullRampDemand: demand at ramp=1 with all multipliers except ramp and noise
        const fullRampBase = baseDemand * elasticityMult * marketingMult * barcodeMult;
        const fullRampDemand = Math.max(
          1,
          Math.floor(fullRampBase + (recessionSeverityThisTurn > 0 ? fullRampBase * (recessionSeverityThisTurn - 1) : 0))
        );

        // Step 2: Ramp fraction applied to get ramped demand
        const currentProgress  = firm.salesRampProgress[product] ?? 0;
        const rampFraction     = computeRampFraction(currentProgress);
        const afterMultipliers = baseDemand * rampFraction * elasticityMult * marketingMult * barcodeMult;

        // Step 6: Recession displacement
        const recessionDisplacement = recessionSeverityThisTurn > 0
          ? afterMultipliers * (recessionSeverityThisTurn - 1)
          : 0;
        const afterRecession = afterMultipliers + recessionDisplacement;

        // Step 7: Noise
        const noise = sampleNormal(0, GameConfig.demand.noiseStdDev * Math.max(0, afterRecession));
        const noisyDemand = Math.max(0, Math.floor(afterRecession + noise));

        tickData.effectiveDemand[firm.id][product] = noisyDemand;
        tickData.demandNoiseTerm[firm.id][product]  = noise;

        // TODO: Utilization system redesign
        // The current capacity model derives maxThroughput from fullRampDemand, making capacity
        // always conveniently equal to demand at 100% training. This is unrealistic.
        //
        // Desired behavior:
        // 1. Store capacity is determined independently of demand: by store size, employee count,
        //    and trainedFraction. A small store on an A-location cannot serve all customers even
        //    at 100% training. A large store on a C-location may have more capacity than customers.
        //
        // 2. City-wide demand pool per product: multiple stores in the same city compete for the
        //    same demand pool. If player store fills 60% and competitor fills 30%, only 10% remains
        //    unserved. Stores should draw from a shared city-level demand, not each calculate
        //    independently as if the full market is available to them alone.
        //
        // 3. Overcapacity is a real cost: a store with more throughput capacity than demand wastes
        //    staff investment. The player should feel this through staff wages with no corresponding
        //    revenue benefit.
        //
        // See /docs/spec/roadmap/utilization-redesign.md for full specification.
        // Per-product capacity cap: maxThroughput scales with trainedFraction
        const cfg = GameConfig.storeTraining;
        const maxThroughput = Math.floor(fullRampDemand * (cfg.capacityMin + firm.trainedFraction * cfg.capacityRange));

        const inventoryCapped = Math.min(available, noisyDemand);
        const sold = Math.min(inventoryCapped, maxThroughput);

        firm.utilizationPerSlot[product]  = maxThroughput > 0 ? sold / maxThroughput : 0;
        firm.capacityLimitedSlot[product] = sold < noisyDemand && sold === maxThroughput;

        // Ramp progress advancement
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
          product:       product,
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
            product:       product,
            quantity:      removed,
            unitPrice:     unitCost,
            total:         0,
          });
        }

        checkMilestones(state, firm.corporationId);
      }
    }
  }

  return tickData;
}

// ============================================================
// Helpers
// ============================================================


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
 * Applies location/size multipliers and elasticity — no ramp, marketing, barcode, or recession.
 * Used for the UI "Market size" hint: the ceiling the player is growing toward.
 *
 * locationClass and size are optional for backward compatibility with callers that
 * don't have firm context (they receive the unscaled base demand).
 */
export function estimatedDemand(
  population: number,
  product: ProductId,
  retailPrice?: number,
  opts?: { locationClass?: "A" | "B" | "C"; size?: "small" | "medium" | "large" }
): number {
  const rawBase = computeBaseDemand(population, product);
  if (rawBase === 0) return 0;
  const locMult  = opts?.locationClass ? GameConfig.storeSlots.locationMultiplier[opts.locationClass] : 1;
  const sizeMult = opts?.size ? GameConfig.storeSlots.sizeMultiplier[opts.size] : 1;
  const base     = Math.floor(rawBase * locMult * sizeMult);
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

  const rawBase = computeBaseDemand(cityNode.population, product);
  if (rawBase <= 0) return 0;

  const benchmark = GameConfig.retailBenchmarkPrices[product];
  if (!benchmark || benchmark <= 0) return 0;

  const locMult  = GameConfig.storeSlots.locationMultiplier[firm.locationClass];
  const sizeMult = GameConfig.storeSlots.sizeMultiplier[firm.size];
  const base     = Math.floor(rawBase * locMult * sizeMult);
  if (base <= 0) return 0;

  const corp = state.corporations[firm.corporationId];

  // Step 2: Ramp
  const progress     = firm.salesRampProgress[product] ?? 0;
  const rampFraction = computeRampFraction(progress);

  // Step 3: Elasticity (scaled by location class and city wealth)
  const configElasticity = GameConfig.retailElasticity[product] ?? 0;
  const elasticityScale  = GameConfig.storeSlots.elasticityScaling[firm.locationClass];
  const wealthAdj        = getWealthElasticityAdjustment(cityNode);
  const elasticity       = configElasticity * elasticityScale * wealthAdj;
  const priceDeltaPct    = ((retailPrice - benchmark) / benchmark) * 100;
  const elasticityMult   = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

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

/**
 * Fully-ramped demand for a firm/product this turn (rampFraction fixed at 1.0).
 * Used by harborSpotPurchase to compute the per-product capacity cap before buying.
 * Follows steps 1, 3–6 of the demand pipeline; excludes step 2 (ramp) and step 7 (noise).
 */
export function computeFullRampDemand(
  state: GameState,
  firm: Firm,
  product: ProductId,
  retailPrice: number
): number {
  const cityNode = state.cityNodes[firm.cityNodeId];
  if (!cityNode) return 0;

  const rawBase = computeBaseDemand(cityNode.population, product);
  if (rawBase <= 0) return 0;

  const benchmark = GameConfig.retailBenchmarkPrices[product];
  if (!benchmark || benchmark <= 0) return 0;

  const locMult  = GameConfig.storeSlots.locationMultiplier[firm.locationClass];
  const sizeMult = GameConfig.storeSlots.sizeMultiplier[firm.size];
  const base     = Math.floor(rawBase * locMult * sizeMult * getCityDemandMultiplier(state, firm.cityNodeId));
  if (base <= 0) return 0;

  const corp = state.corporations[firm.corporationId];

  const configElasticity = GameConfig.retailElasticity[product] ?? 0;
  const elasticityScale  = GameConfig.storeSlots.elasticityScaling[firm.locationClass];
  const wealthAdj        = getWealthElasticityAdjustment(cityNode);
  const elasticity       = configElasticity * elasticityScale * wealthAdj;
  const priceDeltaPct    = ((retailPrice - benchmark) / benchmark) * 100;
  const elasticityMult   = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

  const marketingMult = computeMarketingMultiplier(corp.marketingBudgetPerTurn);
  const barcodeMult   = state.barcodeAvailable &&
    firm.investments.some((i) => i.type === "barcode_scanning" && i.status === "complete")
    ? 1.05 : 1.0;

  const afterMultipliers = base * elasticityMult * marketingMult * barcodeMult;
  const recessionDisplacement = state.recessionTurnsRemaining > 0
    ? afterMultipliers * (state.recessionSeverity - 1)
    : 0;

  return Math.max(1, Math.floor(afterMultipliers + recessionDisplacement));
}
