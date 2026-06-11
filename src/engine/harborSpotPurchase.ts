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

import type { GameState, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { getBasePrice } from "./harbor";
import { estimatedDemand } from "./retail";
import { addToInventory } from "./utils";
import { postTransaction } from "./ledger";
import { requireCash, eliminateCorporation } from "./bankruptcy";
import { displayName } from "./products";

/** Returns products the store can currently sell, based on built sections. */
export function getStoreSellableProducts(
  firm: { investments: { type: string; status: string }[] }
): ProductId[] {
  const has = (t: string) =>
    firm.investments.some((i) => i.type === t && i.status === "complete");
  const products: ProductId[] = [];
  if (has("grocery_section"))     products.push("chicken", "chicken_soup", "ice_cream_strawberry");
  if (has("electronics_section")) products.push("laptop_branded", "printer_branded");
  return products;
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
 */
export function runHarborSpotPurchases(state: GameState): void {
  for (const firm of Object.values(state.firms)) {
    if (firm.type !== "store") continue;

    const corp        = state.corporations[firm.corporationId];
    if (corp.eliminated) continue;

    const sellable    = new Set(getStoreSellableProducts(firm));
    const city        = state.cityNodes[firm.cityNodeId];
    if (!city) continue;

    for (const [rawProduct, enabled] of Object.entries(firm.harborAutoSource)) {
      if (!enabled) continue;
      const productId = rawProduct as ProductId;

      // Only source products the store section supports
      if (!sellable.has(productId)) continue;

      // Only source harbor-sold products
      const basePrice = getBasePrice(productId);
      if (basePrice <= 0) continue;

      // Current harbor price (already includes noise + shock displacement)
      const harborPrice = (state.harborNode.prices as Record<string, number>)[productId] ?? basePrice;

      // Spot price = harbor price + premium
      const spotPrice   = +(harborPrice * (1 + GameConfig.spotPurchasePremium)).toFixed(4);

      // Quantity = estimated demand at current retail price
      const retailPrice = firm.retailPrices[productId] ?? GameConfig.retailBenchmarkPrices[productId] ?? 0;
      const qty         = estimatedDemand(city.population, productId, retailPrice);
      if (qty <= 0) continue;

      const total = qty * spotPrice;

      if (corp.isPlayer) {
        requireCash(corp, total, `Harbor spot purchase — ${displayName(productId)}`);
      } else if (corp.cash < total) {
        continue; // AI can't afford it — skip silently
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
