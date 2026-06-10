import type { GameState, ProductId, RecipeKey } from "../types";
import { GameConfig } from "../config/gameConfig";
import { addToInventory, removeFromInventory, inventoryQuantity } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment, countInvestment } from "./investments";

/** Run production for all farms and factories. */
export function runProduction(state: GameState): void {
  for (const firm of Object.values(state.firms)) {
    if (firm.type === "farm") runFarmProduction(state, firm.id);
    if (firm.type === "factory") runFactoryProduction(state, firm.id);
  }
}

// ------------------------------------------------------------------
// Farm production
// ------------------------------------------------------------------

function runFarmProduction(state: GameState, firmId: string): void {
  const firm = state.firms[firmId];
  const quarter = state.turn % GameConfig.game.quartersPerYear;
  const seasonMultiplier = GameConfig.seasonal.yieldMultiplier[quarter];

  const cropCount = countInvestment(firm, "crop_fields");
  const livestockCount = countInvestment(firm, "livestock_facilities");
  if (cropCount + livestockCount === 0) return;

  const irrigated = hasInvestment(firm, "irrigation_systems");
  const reliabilityMultiplier = irrigated ? 1.0 : 0.8 + Math.random() * 0.2;

  const basePerField = 100;
  const cropOutput = Math.floor(cropCount * basePerField * seasonMultiplier * reliabilityMultiplier);
  const livestockOutput = Math.floor(livestockCount * 80 * reliabilityMultiplier);
  const total = cropOutput + livestockOutput;
  if (total > 0) addToInventory(firm.inventory, "raw_chicken", total, 0);
}

// ------------------------------------------------------------------
// Factory production
// ------------------------------------------------------------------

function runFactoryProduction(state: GameState, firmId: string): void {
  const firm = state.firms[firmId];
  const lineCount = countInvestment(firm, "production_line");
  if (lineCount === 0) return;

  // Each configured production line runs one recipe
  const configuredLines = firm.productionLines.filter((pl) => pl.recipe !== null);

  // Unconfigured lines: auto-select by available inventory (backward compat)
  const unconfiguredCount = lineCount - configuredLines.length;

  // Run configured lines
  let linesUsed = 0;
  for (const lineSetup of configuredLines) {
    if (linesUsed >= lineCount) break;
    if (!lineSetup.recipe) continue;
    runRecipe(state, firmId, lineSetup.recipe);
    linesUsed++;
  }

  // Auto-run unconfigured lines
  if (unconfiguredCount > 0) {
    const recipes: RecipeKey[] = [
      "chicken", "chicken_soup", "alumina_refining", "aluminium_smelting", "laptop_branding",
    ];
    for (const recipe of recipes) {
      if (linesUsed >= lineCount) break;
      const cfg = GameConfig.production[recipe];
      if (inventoryQuantity(firm.inventory, cfg.inputProduct) > 0) {
        runRecipe(state, firmId, recipe);
        linesUsed++;
      }
    }
  }
}

function runRecipe(state: GameState, firmId: string, recipeKey: RecipeKey): void {
  const firm = state.firms[firmId];
  const recipe = GameConfig.production[recipeKey];

  // Prerequisite checks
  if (recipe.requiresPackaging && !hasInvestment(firm, "packaging_lines")) return;
  if (recipe.requiresBranding && !hasInvestment(firm, "branding_facility")) return;

  // Multi-turn batches
  if (recipe.turnsPerBatch > 1) {
    firm.productionProgress[recipeKey] += 1;
    if (firm.productionProgress[recipeKey] < recipe.turnsPerBatch) return;
    firm.productionProgress[recipeKey] = 0;
  }

  const inputAvailable = inventoryQuantity(firm.inventory, recipe.inputProduct);
  if (inputAvailable <= 0) return;

  const batchInput = Math.min(inputAvailable, GameConfig.productionBatchSize);
  const outputQty = Math.floor((batchInput / recipe.inputQuantity) * recipe.outputQuantity);
  if (outputQty <= 0) return;

  const { removed, unitCost } = removeFromInventory(firm.inventory, recipe.inputProduct, batchInput);
  if (removed <= 0) return;

  const inputCostTotal = removed * unitCost;
  const outputUnitCost = outputQty > 0 ? inputCostTotal / outputQty : 0;
  addToInventory(firm.inventory, recipe.outputProduct, outputQty, outputUnitCost);

  if (inputCostTotal > 0) {
    postTransaction({
      state, turn: state.turn, firmId: firm.id, corporationId: firm.corporationId,
      category: "input_cost", counterparty: "Production",
      product: recipe.inputProduct as ProductId,
      quantity: removed, unitPrice: unitCost, total: -inputCostTotal,
    });
  }
}
