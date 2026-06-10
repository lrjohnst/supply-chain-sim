import type { GameState, ProductId } from "../types";
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
  const quarter = (state.turn % GameConfig.game.quartersPerYear);
  const seasonMultiplier = GameConfig.seasonal.yieldMultiplier[quarter];

  const cropCount = countInvestment(firm, "crop_fields");
  const livestockCount = countInvestment(firm, "livestock_facilities");

  const irrigated = hasInvestment(firm, "irrigation_systems");
  const reliabilityMultiplier = irrigated ? 1.0 : 0.8 + Math.random() * 0.2;

  // Each crop field produces raw chicken equivalents (simplified: one farm output)
  const baseOutputPerField = 100; // units per turn
  const cropOutput = Math.floor(
    cropCount * baseOutputPerField * seasonMultiplier * reliabilityMultiplier
  );

  // Livestock produces raw chicken
  const baseOutputPerLivestock = 80;
  const livestockOutput = Math.floor(
    livestockCount * baseOutputPerLivestock * reliabilityMultiplier
  );

  const totalOutput = cropOutput + livestockOutput;
  if (totalOutput <= 0) return;

  addToInventory(firm.inventory, "raw_chicken", totalOutput, 0); // farm cost is operating cost, not per-unit

  // No input cost transaction — farm output cost basis is 0 (operating cost covers it)
}

// ------------------------------------------------------------------
// Factory production
// ------------------------------------------------------------------

function runFactoryProduction(state: GameState, firmId: string): void {
  const firm = state.firms[firmId];

  // Find all contracts that source inputs TO this factory, or use harbor
  // Production lines determine what this factory can make
  const productionLineCount = countInvestment(firm, "production_line");
  if (productionLineCount === 0) return;

  // Determine which recipes this factory can run based on its inventory
  // and which chains the corporation has set up (indicated by active contracts)
  const recipes = Object.entries(GameConfig.production) as [
    string,
    typeof GameConfig.production[keyof typeof GameConfig.production]
  ][];

  // Each production line runs one recipe per turn
  // For MVP: factory auto-selects recipes based on available inventory
  let linesAvailable = productionLineCount;

  for (const [, recipe] of recipes) {
    if (linesAvailable <= 0) break;

    const inputAvailable = inventoryQuantity(firm.inventory, recipe.inputProduct);
    if (inputAvailable <= 0) continue;

    // Check prerequisites
    if (recipe.requiresPackaging && !hasInvestment(firm, "packaging_lines")) continue;
    if (recipe.inputProduct === "laptop_whitelabel" && !hasInvestment(firm, "branding_facility")) continue;

    // Smelting needs 2 turns — track progress on firm
    if (recipe.turnsPerBatch > 1) {
      firm.productionProgress += 1;
      if (firm.productionProgress < recipe.turnsPerBatch) continue;
      firm.productionProgress = 0;
    }

    // Calculate batch size based on available input (cap at one line's worth)
    const maxBatchInput = 200; // units per production line per turn
    const batchInput = Math.min(inputAvailable, maxBatchInput);
    const batchesOfInput = batchInput / recipe.inputQuantity;
    const outputQty = Math.floor(batchesOfInput * recipe.outputQuantity);

    if (outputQty <= 0) continue;

    const { removed, unitCost } = removeFromInventory(
      firm.inventory,
      recipe.inputProduct,
      batchInput
    );

    if (removed <= 0) continue;

    const inputCostTotal = removed * unitCost;
    const outputUnitCost = outputQty > 0 ? inputCostTotal / outputQty : 0;

    addToInventory(firm.inventory, recipe.outputProduct, outputQty, outputUnitCost);

    if (inputCostTotal > 0) {
      postTransaction({
        state,
        turn: state.turn,
        firmId: firm.id,
        corporationId: firm.corporationId,
        category: "input_cost",
        counterparty: "Production",
        product: recipe.inputProduct as ProductId,
        quantity: removed,
        unitPrice: unitCost,
        total: -inputCostTotal,
      });
    }

    linesAvailable -= 1;
  }
}
