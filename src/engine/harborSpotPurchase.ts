/**
 * harborSpotPurchase.ts — automatic per-turn harbor sourcing for stores.
 *
 * When a player enables harbor auto-source for a product on a store,
 * the game buys exactly estimated demand each turn as a spot purchase.
 * No contract is created. No surplus accumulates. The player only
 * manages the retail price; quantity is driven by the demand calculation.
 *
 * Spot premium applies (no contract = spot price).
 * Assumptions flagged in code comments.
 */

import type { GameState, ProductId, InvestmentType } from "../types";
import { GameConfig } from "../config/gameConfig";
import { getBasePrice } from "./harbor";
import { computeFullDeterministicDemand, computeFullRampDemand } from "./retail";
import { addToInventory } from "./utils";
import { postTransaction } from "./ledger";
import { requireCash } from "./bankruptcy";
import { displayName, getStoreSellableProducts, STORE_SECTION_PRODUCTS } from "./products";
import { hasInvestment } from "./investments";
import { getHarborLinkDistance } from "./map";

export { getStoreSellableProducts };

export interface HarborCostBreakdown {
  harborPrice:      number;   // post-noise, post-shock harbor price
  spotPremium:      number;   // harborPrice × spotPurchasePremium
  transportCost:    number;   // hops × transportCostPerLink
  totalPerUnit:     number;   // harborPrice + spotPremium + transportCost
  hops:             number;   // link count to nearest harbor node
}

/**
 * Returns the full cost breakdown for a harbor-sourced product for a given
 * store. Read-only — call from UI components to build the cost display.
 * Returns null if the product has no harbor base price.
 */
export function getHarborCostBreakdown(
  state: GameState,
  firmCityNodeId: string,
  productId: ProductId
): HarborCostBreakdown | null {
  const basePrice = getBasePrice(productId);
  if (basePrice <= 0) return null;

  const harborPrice    = (state.harborNode.prices as Record<string, number>)[productId] ?? basePrice;
  const spotPremium    = +(harborPrice * GameConfig.spotPurchasePremium).toFixed(4);
  const hops           = getHarborLinkDistance(state, firmCityNodeId);
  const transportCost  = +(hops * GameConfig.map.transportCostPerLink).toFixed(4);
  const totalPerUnit   = +(harborPrice + spotPremium + transportCost).toFixed(4);

  return { harborPrice, spotPremium, transportCost, totalPerUnit, hops };
}

/**
 * For each store with harbor auto-source products enabled, buy estimated demand
 * each turn at the current spot price (harbor price + spot premium).
 *
 * Called at step 7 of the tick, after tenders and before retail sales,
 * so inventory is populated before demand is evaluated.
 *
 * Note: spot premium (GameConfig.spotPurchasePremium) is applied because
 * these are non-contract purchases. "Harbor spot price" shown in the UI
 * is therefore harbor price × (1 + spotPurchasePremium).
 *
 * Note: the purchase quantity is estimated demand (deterministic from price,
 * population, and elasticity), not noisy effective demand. Slight variance
 * between purchased and sold quantity is expected.
 *
 * Capacity-aware: each product's purchase quantity is capped by its own
 * per-product maxThroughput (fullRampDemand × trainedFraction multiplier),
 * matching the cap applied in runRetailSales. Products do not compete for
 * a shared pool.
 */
export function runHarborSpotPurchases(state: GameState): void {
  for (const firm of Object.values(state.firms)) {
    if (firm.type !== "store") continue;

    const corp = state.corporations[firm.corporationId];
    if (corp.eliminated) continue;

    const sellable = new Set(getStoreSellableProducts(firm));
    if (!state.cityNodes[firm.cityNodeId]) continue;

    const hops          = getHarborLinkDistance(state, firm.cityNodeId);
    const transportCost = +(hops * GameConfig.map.transportCostPerLink).toFixed(4);
    const cfg           = GameConfig.storeTraining;

    // Build a map from productId → its section type for section-gating checks
    const productSection = new Map<ProductId, InvestmentType>();
    for (const [sectionType, products] of Object.entries(STORE_SECTION_PRODUCTS)) {
      for (const p of products!) productSection.set(p as ProductId, sectionType as InvestmentType);
    }

    for (const productId of sellable) {
      if (!firm.harborAutoSource[productId]) continue;
      const sectionType = productSection.get(productId);
      if (!sectionType || !hasInvestment(firm, sectionType)) continue;

      const basePrice = getBasePrice(productId);
      if (basePrice <= 0) continue;

      const retailPrice    = firm.retailPrices[productId] ?? GameConfig.retailBenchmarkPrices[productId] ?? 0;
      const deterministicDemand = computeFullDeterministicDemand(state, firm, productId, retailPrice);
      if (deterministicDemand <= 0) continue;

      // Per-product capacity cap mirrors runRetailSales
      const fullRampDemand  = computeFullRampDemand(state, firm, productId, retailPrice);
      const maxThroughput   = Math.floor(fullRampDemand * (cfg.capacityMin + firm.trainedFraction * cfg.capacityRange));
      const qty             = Math.min(deterministicDemand, maxThroughput);
      if (qty <= 0) continue;

      const harborPrice      = (state.harborNode.prices as Record<string, number>)[productId] ?? basePrice;
      const spotPremiumPrice = +(harborPrice * (1 + GameConfig.spotPurchasePremium)).toFixed(4);
      const spotPrice        = +(spotPremiumPrice + transportCost).toFixed(4);
      const total            = qty * spotPrice;

      if (corp.isPlayer) {
        requireCash(corp, total, `Harbor spot purchase — ${displayName(productId)}`);
      } else if (corp.cash < total) {
        continue;
      }

      addToInventory(firm.inventory, productId, qty, spotPrice);

      postTransaction({
        state,
        turn:          state.turn,
        firmId:        firm.id,
        corporationId: firm.corporationId,
        category:      "input_cost",
        counterparty:  "Harbor (spot)",
        product:       productId,
        quantity:      qty,
        unitPrice:     spotPrice,
        total:         -total,
      });
    }
  }
}
