import type { GameState, Tender } from "../types";
import { GameConfig } from "../config/gameConfig";
import { submitTenderBid } from "./tenders";
import { startInvestment } from "./investments";
import { takeLoan } from "./loans";
import { generateId } from "./utils";
import { makeFirm } from "./newGame";

/** Run one turn of AI decision-making. Called after the player ends their turn. */
export function runAI(state: GameState): void {
  const aiCorp = Object.values(state.corporations).find((c) => !c.isPlayer);
  if (!aiCorp) return;

  bidOnOpenTenders(state, aiCorp.id);
  expandIfOpportunity(state, aiCorp.id);
}

// ------------------------------------------------------------------
// Tender bidding
// ------------------------------------------------------------------

function bidOnOpenTenders(state: GameState, corpId: string): void {
  const corp = state.corporations[corpId];
  const cfg = GameConfig.ai;

  for (const tender of Object.values(state.tenders)) {
    if (tender.status !== "open") continue;
    if (tender.direction !== "market") continue;
    if (state.turn >= tender.closeTurn) continue;

    // Find an AI firm that has this product in inventory
    const candidateFirm = corp.firmIds
      .map((id) => state.firms[id])
      .find((f) =>
        f.inventory.some(
          (l) => l.product === tender.product && l.quantity > 0
        )
      );

    if (!candidateFirm) continue;

    const inventoryLine = candidateFirm.inventory.find(
      (l) => l.product === tender.product
    );
    if (!inventoryLine || inventoryLine.quantity <= 0) continue;

    const unitCost = inventoryLine.unitCost;
    const minPrice = unitCost * (1 + cfg.tenderMarginMinimum);

    // AI bids at target price if profitable, otherwise skips
    if (tender.targetUnitPrice < minPrice) continue;

    const volumeOffered = Math.min(inventoryLine.quantity, tender.volumeRequired);
    const bidPrice = +(tender.targetUnitPrice * (0.97 + Math.random() * 0.03)).toFixed(2);

    submitTenderBid(state, tender.id, candidateFirm.id, volumeOffered, bidPrice);
  }
}

// ------------------------------------------------------------------
// Expansion
// ------------------------------------------------------------------

function expandIfOpportunity(state: GameState, corpId: string): void {
  const corp = state.corporations[corpId];

  // AI won't over-leverage
  const totalDebt = corp.loanIds.reduce(
    (sum, id) => sum + state.loans[id].outstandingBalance,
    0
  );
  const revenue = corp.cumulativeRevenue;
  const debtRatio = revenue > 0 ? totalDebt / revenue : totalDebt / 1;

  if (debtRatio > GameConfig.ai.debtToRevenueRatioLimit) return;

  // Find a city where AI has no presence but player does (competitive pressure)
  const aiCityIds = new Set(corp.firmIds.map((id) => state.firms[id].cityNodeId));
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return;

  const playerCityIds = new Set(
    playerCorp.firmIds.map((id) => state.firms[id].cityNodeId)
  );

  const targetCityId = [...playerCityIds].find((id) => !aiCityIds.has(id));

  if (!targetCityId) {
    // Invest in existing firms instead
    investInExistingFirms(state, corpId);
    return;
  }

  const cityNode = state.cityNodes[targetCityId];
  if (!cityNode) return;

  const existingFirmsInCity = Object.values(state.firms).filter(
    (f) => f.cityNodeId === targetCityId && f.corporationId === corpId
  ).length;

  if (existingFirmsInCity >= cityNode.firmSlots) return;

  // Build a store (lowest barrier to entry)
  const storeCost = 10_000; // base firm establishment cost
  if (corp.cash < storeCost) {
    // Consider a small loan
    if (corp.cash >= 5_000) {
      takeLoan(state, corpId, 30_000, 8);
    }
    return;
  }

  buildFirm(state, corpId, targetCityId, "store");
}

function investInExistingFirms(state: GameState, corpId: string): void {
  const corp = state.corporations[corpId];

  for (const firmId of corp.firmIds) {
    const firm = state.firms[firmId];

    // Prioritise grocery sections for stores that don't have one
    if (
      firm.type === "store" &&
      !firm.investments.some((i) => i.type === "grocery_section" && i.status !== "not_built")
    ) {
      const err = startInvestment(state, firmId, "grocery_section");
      if (!err) return;
    }

    // Prioritise production lines for factories
    if (
      firm.type === "factory" &&
      !firm.investments.some((i) => i.type === "production_line" && i.status !== "not_built")
    ) {
      const err = startInvestment(state, firmId, "production_line");
      if (!err) return;
    }
  }
}

function buildFirm(
  state: GameState,
  corpId: string,
  cityNodeId: string,
  type: "farm" | "factory" | "store"
): void {
  const corp = state.corporations[corpId];
  const firmId = generateId();
  const name = `${corp.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`;
  state.firms[firmId] = makeFirm(firmId, corpId, cityNodeId, type, name);
  corp.firmIds.push(firmId);
}
