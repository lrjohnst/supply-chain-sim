import type { GameState, Contract, ProductId } from "../types";
import { removeFromInventory, addToInventory } from "./utils";
import { postTransaction } from "./ledger";
import { requireCash, eliminateCorporation } from "./bankruptcy";
import { displayName } from "./products";

/** Execute all active contracts for this turn. */
export function executeContracts(state: GameState): void {
  for (const contract of Object.values(state.contracts)) {
    if (contract.status !== "active") continue;
    if (state.turn < contract.startTurn) continue;
    if (state.turn >= contract.startTurn + contract.durationTurns) {
      contract.status = "completed";
      continue;
    }

    executeContract(state, contract);
    contract.turnsExecuted += 1;
  }
}

function executeContract(state: GameState, contract: Contract): void {
  const { buyerParty, sellerParty, product, volumePerTurn, unitPrice } = contract;

  // Resolve seller firm inventory
  const sellerFirmId = sellerParty.firmId;
  const buyerFirmId = buyerParty.firmId;

  // Harbor as seller: buyer firm receives goods from harbor
  if (sellerParty.type === "harbor") {
    const buyerFirm = buyerFirmId ? state.firms[buyerFirmId] : null;
    if (!buyerFirm) return;

    const total = volumePerTurn * unitPrice;
    const buyerCorp = state.corporations[buyerParty.corporationId!];
    if (buyerCorp?.eliminated) return;
    if (buyerCorp?.isPlayer) {
      requireCash(buyerCorp, total, `Harbor supply — ${displayName(product)} (${volumePerTurn}u × €${unitPrice.toFixed(2)}/u)`);
    } else if (buyerCorp && buyerCorp.cash < total) {
      eliminateCorporation(state, buyerCorp.id);
      return;
    }
    addToInventory(buyerFirm.inventory, product, volumePerTurn, unitPrice);

    const buyerCorpId = buyerParty.corporationId!;
    postTransaction({
      state,
      turn: state.turn,
      firmId: buyerFirmId,
      corporationId: buyerCorpId,
      category: "input_cost",
      counterparty: "Harbor",
      product: product as ProductId,
      quantity: volumePerTurn,
      unitPrice,
      total: -total,
    });
    return;
  }

  // Firm-to-firm (internal or between corporations)
  if (sellerFirmId && buyerFirmId) {
    const sellerFirm = state.firms[sellerFirmId];
    const buyerFirm = state.firms[buyerFirmId];

    // Quality check
    if (sellerFirm.quality < contract.qualityThreshold) {
      // Breach: mark and skip
      contract.status = "breached";
      return;
    }

    const { removed, unitCost } = removeFromInventory(
      sellerFirm.inventory,
      product,
      volumePerTurn
    );

    if (removed < volumePerTurn) {
      // Partial fulfillment — for now, fulfill what's available
    }

    if (removed === 0) return;

    const partialUnitPrice = unitPrice; // contracted price regardless of cost basis
    const revenue = removed * partialUnitPrice;
    const costBasis = removed * unitCost;

    addToInventory(buyerFirm.inventory, product, removed, partialUnitPrice);

    const sellerCorpId = sellerParty.corporationId!;
    const buyerCorpId = buyerParty.corporationId!;

    // Seller receives revenue
    postTransaction({
      state,
      turn: state.turn,
      firmId: sellerFirmId,
      corporationId: sellerCorpId,
      category: "revenue",
      counterparty: contract.isInternal ? `[Internal] ${buyerFirm.name}` : buyerFirm.name,
      product: product as ProductId,
      quantity: removed,
      unitPrice: partialUnitPrice,
      total: revenue,
    });

    // Buyer pays (only if external — internal contracts net to zero at corporate level)
    if (!contract.isInternal) {
      postTransaction({
        state,
        turn: state.turn,
        firmId: buyerFirmId,
        corporationId: buyerCorpId,
        category: "input_cost",
        counterparty: sellerFirm.name,
        product: product as ProductId,
        quantity: removed,
        unitPrice: partialUnitPrice,
        total: -revenue,
      });
    } else {
      // Internal: record cost basis transfer (cost moves, no cash changes)
      // The input cost is already embedded in the inventory unitCost
      // We record it for firm-level books clarity
      postTransaction({
        state,
        turn: state.turn,
        firmId: buyerFirmId,
        corporationId: buyerCorpId,
        category: "input_cost",
        counterparty: `[Internal] ${sellerFirm.name}`,
        product: product as ProductId,
        quantity: removed,
        unitPrice: costBasis / removed,
        total: 0, // net zero — cash doesn't move between own firms
      });
    }
  }
}

/** Create a new contract. Returns error string or null on success. */
export function createContract(
  state: GameState,
  contract: Omit<Contract, "id" | "turnsExecuted">
): string | null {
  // Multi-year contract milestone check
  if (contract.durationTurns > 2) {
    const corp = state.corporations[contract.buyerParty.corporationId ?? contract.sellerParty.corporationId ?? ""];
    if (corp && !corp.multiYearContractsUnlocked) {
      return "Multi-year contracts are locked until €100k cumulative revenue is reached.";
    }
  }

  const id = Math.random().toString(36).slice(2, 10);
  state.contracts[id] = { ...contract, id, turnsExecuted: 0 };
  return null;
}
