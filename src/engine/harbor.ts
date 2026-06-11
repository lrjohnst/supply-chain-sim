/**
 * harbor.ts — single source of truth for harbor products, base prices,
 * and per-turn price calculation (base + shock displacement + noise).
 *
 * Architecture note: base prices are static constants defined here.
 * state.harborNode.prices holds the *calculated* price each turn and is
 * what the rest of the engine reads. Nothing outside this file should
 * reference raw base prices directly.
 */

import type { GameState, ProductId, ActiveHarborShock } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId, clamp, sampleNormal } from "./utils";

// ============================================================
// Base price catalogue
// 0 = not sold by harbor
// ============================================================

export const HARBOR_BASE_PRICES: Record<ProductId, number> = {
  raw_chicken:        0,    // not sold by harbor
  chicken:            0,    // not sold by harbor
  chicken_soup:       0,    // not sold by harbor
  bauxite:           31,
  alumina:            0,    // not sold by harbor
  aluminium:          0,    // not sold via harbor (tender only)
  laptop_whitelabel: 320,
  laptop_branded:     0,    // harbor does not sell branded
  ice_cream_strawberry: 1.4,
  printer_branded:   95,
};

// ============================================================
// Public API
// ============================================================

/**
 * Products the harbor currently sells (base price > 0).
 * Ready for dynamic expansion — swap out this function body
 * in the future without touching callers.
 */
export function getHarborSoldProducts(): ProductId[] {
  return (Object.entries(HARBOR_BASE_PRICES) as [ProductId, number][])
    .filter(([, price]) => price > 0)
    .map(([id]) => id);
}

export function getBasePrice(productId: ProductId): number {
  return HARBOR_BASE_PRICES[productId] ?? 0;
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
 *   where noiseTerm ~ N(0, noiseStdDev × basePrice)
 *
 * Shock displacement follows an S-curve decay to zero.
 * When |displacement| < 1% of basePrice, the shock is resolved.
 */
export function tickHarborPrices(state: GameState): HarborTickData {
  const cfg = GameConfig.commodityShockEvents;
  const noiseStdDev = GameConfig.harborPrices.noiseStdDev;

  const noiseTerm: Partial<Record<ProductId, number>> = {};
  const shockDisplacement: Partial<Record<ProductId, number>> = {};

  // Build a map of current displacement per product from active shocks
  const displacementMap: Partial<Record<ProductId, number>> = {};
  const resolvedIds = new Set<string>();

  for (const shock of state.activeHarborShocks) {
    shock.turnsElapsed += 1;
    const displacement = computeShockDisplacement(shock, cfg.kSteepness);
    const resolved = Math.abs(displacement) < 0.01 * shock.basePrice;
    if (resolved) {
      resolvedIds.add(shock.id);
      displacementMap[shock.productId] = 0;
    } else {
      displacementMap[shock.productId] = displacement;
    }
  }

  // Remove resolved shocks
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
  if (basePrice <= 0) return; // can't shock a product not sold by harbor

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
  // S-curve: progress goes 0→1 as turnsElapsed goes 0→normalizationDuration
  const progress = 1 / (1 + Math.exp(-k * (shock.turnsElapsed - midpoint)));
  return (shock.shockedPrice - shock.basePrice) * (1 - progress);
}

// Re-export generateId for macroEvents to use without an extra import
export { clamp };
