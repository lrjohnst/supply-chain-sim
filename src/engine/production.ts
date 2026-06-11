import type { GameState, ProductId, RecipeKey, ProductionLineSetup } from "../types";
import { GameConfig } from "../config/gameConfig";
import { addToInventory, removeFromInventory, inventoryQuantity } from "./utils";
import { postTransaction } from "./ledger";
import { hasInvestment, countInvestment } from "./investments";

/** Run production for all farms and factories. */
export function runProduction(state: GameState): void {
  for (const firm of Object.values(state.firms)) {
    if (firm.type === "farm")    runFarmProduction(state, firm.id);
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

  const cropCount      = countInvestment(firm, "crop_fields");
  const livestockCount = countInvestment(firm, "livestock_facilities");
  if (cropCount + livestockCount === 0) return;

  const irrigated           = hasInvestment(firm, "irrigation_systems");
  const reliabilityMultiplier = irrigated ? 1.0 : 0.8 + Math.random() * 0.2;

  const cropOutput      = Math.floor(cropCount      * 100 * seasonMultiplier * reliabilityMultiplier);
  const livestockOutput = Math.floor(livestockCount *  80 * reliabilityMultiplier);
  const total           = cropOutput + livestockOutput;
  if (total > 0) addToInventory(firm.inventory, "raw_chicken", total, 0);
}

// ------------------------------------------------------------------
// Factory production
// ------------------------------------------------------------------

/**
 * Run production for a factory.
 *
 * Each completed production_line investment has exactly one ProductionLineSetup.
 * Only lines with lineStatus === "active" and a configured recipe run.
 * Lines without a recipe or in startup phase are silently skipped.
 *
 * There is no auto-recipe fallback. A line must be explicitly configured.
 * Each line has its own independent batch progress counter (lineSetup.progress).
 */
function runFactoryProduction(state: GameState, firmId: string): void {
  const firm = state.firms[firmId];
  const lineCount = countInvestment(firm, "production_line");
  if (lineCount === 0) return;

  for (const lineSetup of firm.productionLines) {
    if (lineSetup.lineStatus !== "active") continue;
    if (!lineSetup.recipe) continue;
    runRecipe(state, firmId, lineSetup);
  }
}

function runRecipe(
  state: GameState,
  firmId: string,
  lineSetup: ProductionLineSetup
): void {
  const firm       = state.firms[firmId];
  const recipeKey  = lineSetup.recipe as RecipeKey;
  const recipe     = GameConfig.production[recipeKey];

  // Prerequisite checks
  if (recipe.requiresPackaging && !hasInvestment(firm, "packaging_lines")) return;
  if (recipe.requiresBranding  && !hasInvestment(firm, "branding_facility")) return;

  // Multi-turn batches — per-line progress counter
  if (recipe.turnsPerBatch > 1) {
    lineSetup.progress += 1;
    if (lineSetup.progress < recipe.turnsPerBatch) return;
    lineSetup.progress = 0;
  }

  const inputAvailable = inventoryQuantity(firm.inventory, recipe.inputProduct);
  if (inputAvailable <= 0) return;

  // Per-recipe batch size cap (replaces old global productionBatchSize)
  const batchInput = Math.min(inputAvailable, recipe.maxBatchSizePerTurn);
  const outputQty  = Math.floor((batchInput / recipe.inputQuantity) * recipe.outputQuantity);
  if (outputQty <= 0) return;

  const { removed, unitCost } = removeFromInventory(firm.inventory, recipe.inputProduct, batchInput);
  if (removed <= 0) return;

  const inputCostTotal  = removed * unitCost;
  const outputUnitCost  = outputQty > 0 ? inputCostTotal / outputQty : 0;
  addToInventory(firm.inventory, recipe.outputProduct, outputQty, outputUnitCost);

  if (inputCostTotal > 0) {
    postTransaction({
      state,
      turn:          state.turn,
      firmId:        firm.id,
      corporationId: firm.corporationId,
      category:      "input_cost",
      counterparty:  "Production",
      product:       recipe.inputProduct as ProductId,
      quantity:      removed,
      unitPrice:     unitCost,
      total:         -inputCostTotal,
    });
  }
}
