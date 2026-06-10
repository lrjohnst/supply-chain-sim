import type { GameState, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { inventoryQuantity, removeFromInventory } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment } from "./investments";

type ExtendedState = GameState & { recessionTurnsRemaining?: number };

/** Run B2C retail sales for all stores. */
export function runRetailSales(state: GameState): void {
  const ext = state as ExtendedState;

  // Tick down recession
  if (ext.recessionTurnsRemaining && ext.recessionTurnsRemaining > 0) {
    ext.recessionTurnsRemaining -= 1;
  }

  const recessionMultiplier =
    ext.recessionTurnsRemaining && ext.recessionTurnsRemaining > 0
      ? GameConfig.macroEvents.recessionDemandMultiplier
      : 1.0;

  for (const firm of Object.values(state.firms)) {
    if (firm.type !== "store") continue;

    const cityNode = state.cityNodes[firm.cityNodeId];
    if (!cityNode) continue;

    const corporation = state.corporations[firm.corporationId];
    const marketingMultiplier = computeMarketingMultiplier(corporation.marketingBudgetPerTurn);
    const barcodeMultiplier = state.barcodeAvailable && hasInvestment(firm, "barcode_scanning") ? 1.05 : 1.0;

    const sellableProducts = getSellableProducts(firm);

    for (const product of sellableProducts) {
      const retailPrice = GameConfig.retailPrices[product];
      if (!retailPrice || retailPrice <= 0) continue;

      const baselineDemand = computeBaseDemand(cityNode.population, product);
      if (baselineDemand <= 0) continue;

      const effectiveDemand = Math.floor(
        baselineDemand * recessionMultiplier * marketingMultiplier * barcodeMultiplier
      );

      const available = inventoryQuantity(firm.inventory, product);
      const sold = Math.min(available, effectiveDemand);
      if (sold <= 0) continue;

      const { removed, unitCost } = removeFromInventory(firm.inventory, product, sold);
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

      // Record cost-of-goods-sold as input cost for firm P&L
      if (unitCost > 0 && removed > 0) {
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
          total: -(removed * unitCost),
        });
      }

      // Check milestone
      if (!corporation.multiYearContractsUnlocked &&
          corporation.cumulativeRevenue >= GameConfig.game.multiYearContractRevenueThreshold) {
        corporation.multiYearContractsUnlocked = true;
      }
    }
  }
}

function getSellableProducts(firm: { investments: { type: string; status: string }[] }): string[] {
  const products: string[] = [];
  const investments = firm.investments;

  const has = (type: string) =>
    investments.some((i) => i.type === type && i.status === "complete");

  if (has("grocery_section")) {
    products.push("chicken", "chicken_soup", "ice_cream_strawberry");
  }
  if (has("electronics_section")) {
    products.push("laptop_branded", "printer_branded");
  }
  if (has("cosmetics_section")) {
    // post-MVP products
  }
  if (has("hardware_section")) {
    // post-MVP products
  }

  return products;
}

function computeBaseDemand(population: number, product: string): number {
  const perCapita = (GameConfig.consumerDemand.perCapitaDemand as Record<string, number>)[product];
  if (!perCapita) return 0;
  return Math.floor(population * perCapita);
}

function computeMarketingMultiplier(budgetPerTurn: number): number {
  const raw = 1 + budgetPerTurn * GameConfig.marketing.demandMultiplierPerUnit;
  return Math.min(raw, GameConfig.marketing.maxDemandMultiplier);
}
