/**
 * harbor.ts — harbor pricing logic.
 *
 * Owns: per-turn price calculation (base + shock displacement + noise),
 *       shock lifecycle management, and the getHarborSoldProducts() query.
 *
 * Does NOT own: base price values (→ gameConfig.harborBasePrices),
 *               product structure (→ products.ts).
 */

import type { GameState, ProductId, ActiveHarborShock } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId, clamp, sampleNormal } from "./utils";
import { getProductsByPurchaseSource } from "./products";

// ============================================================
// Public API — product queries
// ============================================================

/**
 * Products the harbor currently sells.
 * Derived from the product registry — any product with "harbor" as a
 * purchase source and a non-zero base price in config is included.
 * Ready for dynamic expansion: change the registry or config, not this function.
 */
export function getHarborSoldProducts(): ProductId[] {
  return getProductsByPurchaseSource("harbor").filter(
    (id) => getBasePrice(id) > 0
  );
}

/** Base price for a product. Returns 0 if not sold by harbor. */
export function getBasePrice(productId: ProductId): number {
  return (GameConfig.harborBasePrices as Record<string, number>)[productId] ?? 0;
}

// ============================================================
// Per-turn harbor price tick
// ============================================================

export interface HarborTickData {
  /** Per-product noise term drawn this turn. */
  noiseTerm: Partial<Record<ProductId, number>>;
  /** Per-product shock displacement this turn (0 if no active shock). */
  shockDisplacement: Partial<Record<ProductId, number>>;
}

/**
 * Recalculate every harbor price for this turn.
 * Mutates: state.harborNode.prices, state.activeHarborShocks.
 * Returns tick data for snapshot recording.
 *
 * Price formula (per product, per turn):
 *   price = basePrice + shockDisplacement + noiseTerm
 *   noiseTerm ~ N(0, noiseStdDev × basePrice)
 *
 * Shock displacement follows an S-curve decay to zero.
 * Shock resolves when |displacement| < 1% of basePrice.
 */
export function tickHarborPrices(state: GameState): HarborTickData {
  const cfg = GameConfig.commodityShockEvents;
  const noiseStdDev = GameConfig.harborPrices.noiseStdDev;

  const noiseTerm: Partial<Record<ProductId, number>> = {};
  const shockDisplacement: Partial<Record<ProductId, number>> = {};

  // Advance all active shocks and compute their displacements
  const displacementMap: Partial<Record<ProductId, number>> = {};
  const resolvedIds = new Set<string>();

  for (const shock of state.activeHarborShocks) {
    shock.turnsElapsed += 1;
    const displacement = computeShockDisplacement(shock, cfg.kSteepness);
    if (Math.abs(displacement) < 0.01 * shock.basePrice) {
      resolvedIds.add(shock.id);
      displacementMap[shock.productId] = 0;
    } else {
      displacementMap[shock.productId] = displacement;
    }
  }

  state.activeHarborShocks = state.activeHarborShocks.filter(
    (s) => !resolvedIds.has(s.id)
  );

  // Calculate price per sold product
  for (const productId of getHarborSoldProducts()) {
    const base = getBasePrice(productId);
    const displacement = displacementMap[productId] ?? 0;
    const noise = sampleNormal(0, noiseStdDev * base);

    noiseTerm[productId] = noise;
    shockDisplacement[productId] = displacement;

    const calculated = Math.max(0.01, base + displacement + noise);
    (state.harborNode.prices as Record<ProductId, number>)[productId] = +calculated.toFixed(4);
  }

  return { noiseTerm, shockDisplacement };
}

/**
 * Create a new ActiveHarborShock and push it onto state.
 * Called from macroEvents when a commodity_price_shock event fires.
 */
export function createHarborShock(
  state: GameState,
  productId: ProductId,
  multiplier: number
): void {
  const basePrice = getBasePrice(productId);
  if (basePrice <= 0) return;

  const shockedPrice = +(basePrice * multiplier).toFixed(4);
  const normalizationDuration = Math.max(
    1,
    Math.round(
      sampleNormal(
        GameConfig.commodityShockEvents.normalizationMeanTurns,
        GameConfig.commodityShockEvents.normalizationStdDev
      )
    )
  );

  state.activeHarborShocks.push({
    id: generateId(),
    productId,
    basePrice,
    shockedPrice,
    normalizationDuration,
    turnsElapsed: 0,
  });
}

// ============================================================
// Internal helpers
// ============================================================

function computeShockDisplacement(shock: ActiveHarborShock, k: number): number {
  const midpoint = shock.normalizationDuration / 2;
  const progress = 1 / (1 + Math.exp(-k * (shock.turnsElapsed - midpoint)));
  return (shock.shockedPrice - shock.basePrice) * (1 - progress);
}

export { clamp };
