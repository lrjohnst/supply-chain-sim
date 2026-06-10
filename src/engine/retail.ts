import type { GameState, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { inventoryQuantity, removeFromInventory } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment } from "./investments";

/** Run B2C retail sales for all stores. */
export function runRetailSales(state: GameState): void {
  // Tick recession
  if (state.recessionTurnsRemaining > 0) state.recessionTurnsRemaining -= 1;
  const recessionMultiplier = state.recessionTurnsRemaining > 0
    ? GameConfig.macroEvents.recessionDemandMultiplier : 1.0;

  for (const firm of Object.values(state.firms)) {
    if (firm.type !== "store") continue;

    const cityNode = state.cityNodes[firm.cityNodeId];
    if (!cityNode) continue;

    const corporation = state.corporations[firm.corporationId];
    const marketingMultiplier = computeMarketingMultiplier(corporation.marketingBudgetPerTurn);
    const barcodeMultiplier =
      state.barcodeAvailable && hasInvestment(firm, "barcode_scanning") ? 1.05 : 1.0;

    for (const product of getSellableProducts(firm)) {
      const available = inventoryQuantity(firm.inventory, product);
      if (available <= 0) {
        // No inventory — reset ramp so it restarts when stock returns
        if (firm.salesRampTurns[product] !== undefined) {
          firm.salesRampTurns[product] = 0;
        }
        continue;
      }

      // Retail price: player override or benchmark
      const benchmarkPrice = GameConfig.retailBenchmarkPrices[product];
      if (!benchmarkPrice || benchmarkPrice <= 0) continue;
      const retailPrice = firm.retailPrices[product] ?? benchmarkPrice;

      // Elasticity: demand multiplier from price deviation
      const elasticity = GameConfig.retailElasticity[product] ?? 0;
      const priceDeltaPct = ((retailPrice - benchmarkPrice) / benchmarkPrice) * 100;
      const elasticityMultiplier = Math.max(0.1, 1 - (elasticity * priceDeltaPct) / 100);

      // Base demand
      const baseDemand = computeBaseDemand(cityNode.population, product);
      if (baseDemand <= 0) continue;

      // Sales ramp
      const rampTurns = getRampTurns(product);
      const currentRamp = firm.salesRampTurns[product] ?? 0;
      const rampFraction = rampTurns > 0
        ? Math.min(1, GameConfig.salesRamp.rampStartFraction +
            (1 - GameConfig.salesRamp.rampStartFraction) * (currentRamp / rampTurns))
        : 1;

      // Effective demand
      const effectiveDemand = Math.floor(
        baseDemand * elasticityMultiplier * rampFraction * recessionMultiplier
          * marketingMultiplier * barcodeMultiplier
      );

      const sold = Math.min(available, effectiveDemand);
      if (sold <= 0) continue;

      // Advance ramp
      firm.salesRampTurns[product] = currentRamp + 1;

      const { removed, unitCost } = removeFromInventory(firm.inventory, product, sold);
      if (removed <= 0) continue;

      const revenue = removed * retailPrice;
      corporation.cumulativeRevenue += revenue;

      postTransaction({
        state, turn: state.turn, firmId: firm.id, corporationId: firm.corporationId,
        category: "revenue", counterparty: "Retail consumers",
        product: product as ProductId, quantity: removed, unitPrice: retailPrice, total: revenue,
      });

      if (unitCost > 0) {
        postTransaction({
          state, turn: state.turn, firmId: firm.id, corporationId: firm.corporationId,
          category: "input_cost", counterparty: "Cost of goods sold",
          product: product as ProductId, quantity: removed, unitPrice: unitCost,
          total: -(removed * unitCost),
        });
      }

      // Milestone check
      if (!corporation.multiYearContractsUnlocked &&
          corporation.cumulativeRevenue >= GameConfig.game.multiYearContractRevenueThreshold) {
        corporation.multiYearContractsUnlocked = true;
      }
    }
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function getSellableProducts(firm: { investments: { type: string; status: string }[] }): string[] {
  const products: string[] = [];
  const has = (t: string) => firm.investments.some((i) => i.type === t && i.status === "complete");
  if (has("grocery_section"))    products.push("chicken", "chicken_soup", "ice_cream_strawberry");
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
