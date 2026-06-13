import type { GameState, Contract, ProductId } from "../types";
import { removeFromInventory, addToInventory, generateId, inventoryQuantity } from "./utils";
import { postTransaction } from "./ledger";
import { requireCash, eliminateCorporation } from "./bankruptcy";
import { displayName } from "./products";
import { getProductionLineQuality } from "./operatingCosts";
import { checkMilestones } from "./milestones";
import { GameConfig } from "../config/gameConfig";

// ============================================================
// Breach gate proposals
// ============================================================

export interface BreachGateProposal {
  contractId: string;
  reason: "volume_shortfall" | "quality_failure";
  counterpartyName: string;
  /** Corporation that was harmed and must approve breach declaration. */
  harmedCorpId: string;
  /** Corporation that breached (pays the fine). */
  sellerCorpId: string | null;
}

// ============================================================
// Per-turn contract execution
// ============================================================

/** Execute all active contracts for this turn. Returns breach gate proposals for player review. */
export function executeContracts(state: GameState): BreachGateProposal[] {
  const proposals: BreachGateProposal[] = [];
  const cfg = GameConfig.tenders;

  for (const contract of Object.values(state.contracts)) {
    if (contract.status !== "active") continue;
    if (state.turn < contract.startTurn) continue;

    // ---- Advance renewal notice ----
    // Fires incumbentNoticeTurns turns before the last delivery (= one turn before renewal posts).
    if (
      contract.originType === "tender" &&
      contract.originId &&
      !contract.incumbentNoticeGiven
    ) {
      const noticeTurn = contract.startTurn + contract.durationTurns - cfg.incumbentNoticeTurns;
      if (state.turn === noticeTurn) {
        const origTender = state.tenders[contract.originId];
        if (origTender) {
          const incumbentCorpId = contract.sellerParty.corporationId;
          const incumbentCorp = incumbentCorpId ? state.corporations[incumbentCorpId] : null;
          if (incumbentCorp?.isPlayer) {
            const prod = displayName(contract.product);
            state.pendingNotifications.push(
              `Your supply contract for ${prod} expires in ${cfg.incumbentNoticeTurns + 1} turns. ` +
              `A renewal tender will be posted next turn.`
            );
          }
          contract.incumbentNoticeGiven = true;
        }
      }
    }

    // ---- Contract completion ----
    if (state.turn >= contract.startTurn + contract.durationTurns) {
      contract.status = "completed";
      notifyContractEvent(state, contract, "expired");

      // Schedule renewal for tender-origin contracts
      if (contract.originType === "tender" && contract.originId) {
        const origTender = state.tenders[contract.originId];
        if (origTender) {
          state.pendingTenderRenewals.push({
            originalTenderId: contract.originId,
            scheduledForTurn: state.turn,
            incumbentCorporationId: contract.sellerParty.corporationId,
            productId: contract.product,
          });
        }
      }
      continue;
    }

    executeContract(state, contract, proposals);
    contract.turnsExecuted += 1;
  }
  return proposals;
}

// ============================================================
// Breach risk warnings (called from tick.ts)
// ============================================================

export interface ContractWarning {
  id: string;
  message: string;
}

/**
 * Check all active contracts for inventory shortfall and quality breach risk.
 * Returns warnings with stable IDs — callers replace old warnings with these.
 * Throttled per contract to at most once every breachWarningIntervalTurns turns.
 */
export function checkContractRisks(state: GameState): ContractWarning[] {
  const warnings: ContractWarning[] = [];
  const cfg = GameConfig.tenders;

  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return warnings;

  for (const contract of Object.values(state.contracts)) {
    if (contract.status !== "active") continue;

    const playerInvolved =
      contract.sellerParty.corporationId === playerCorp.id ||
      contract.buyerParty.corporationId === playerCorp.id;
    if (!playerInvolved) continue;

    const sellerFirm = contract.sellerParty.firmId
      ? state.firms[contract.sellerParty.firmId]
      : null;
    if (!sellerFirm) continue;

    const shouldWarn =
      contract.lastBreachWarnTurn === 0 ||
      state.turn - contract.lastBreachWarnTurn >= cfg.breachWarningIntervalTurns;

    if (!shouldWarn) continue;

    const prod = displayName(contract.product);
    let warned = false;

    // Inventory shortfall warning
    const invQty = inventoryQuantity(sellerFirm.inventory, contract.product);
    if (invQty < contract.volumePerTurn) {
      warnings.push({
        id: `breach-inv-${contract.id}`,
        message:
          `Contract for ${prod}: only ${Math.round(invQty)} units in inventory, ` +
          `${Math.round(contract.volumePerTurn)} required next turn. Risk of partial delivery.`,
      });
      warned = true;
    }

    // Quality breach risk warning
    if (contract.qualityThreshold > 0) {
      const quality = getProductionLineQuality(sellerFirm, contract.product);
      if (quality < contract.qualityThreshold + cfg.breachWarningQualityMargin) {
        warnings.push({
          id: `breach-qual-${contract.id}`,
          message:
            `Contract for ${prod}: quality at ${(quality * 100).toFixed(1)}%, ` +
            `threshold is ${(contract.qualityThreshold * 100).toFixed(0)}%. ` +
            `Risk of breach if quality continues to decline.`,
        });
        warned = true;
      }
    }

    if (warned) contract.lastBreachWarnTurn = state.turn;
  }

  return warnings;
}

// ============================================================
// Internal contract execution
// ============================================================

function notifyContractEvent(
  state: GameState,
  contract: Contract,
  event: "expired" | "breached" | "partial" | "zeroinventory"
): void {
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return;
  const isPlayerBuyer = contract.buyerParty.corporationId === playerCorp.id;
  const isPlayerSeller = contract.sellerParty.corporationId === playerCorp.id;
  if (!isPlayerBuyer && !isPlayerSeller) return;

  const prod = displayName(contract.product);

  // Resolve a human-readable counterparty name for zero-inventory and partial messages.
  function counterparty(): string {
    if (contract.buyerParty.type === "market") return "Market";
    if (contract.sellerParty.type === "harbor") return "Harbor";
    const otherId = isPlayerSeller ? contract.buyerParty.firmId : contract.sellerParty.firmId;
    return otherId ? (state.firms[otherId]?.name ?? "counterparty") : "counterparty";
  }

  if (event === "expired") {
    state.pendingNotifications.push(`Contract for ${prod} has completed (expired naturally).`);
  } else if (event === "breached") {
    state.pendingNotifications.push(
      `Contract for ${prod} has been breached due to quality falling below threshold.`
    );
  } else if (event === "partial") {
    state.pendingNotifications.push(
      `Partial delivery on contract for ${prod} with ${counterparty()}: seller could not fulfill full volume this turn.`
    );
  } else if (event === "zeroinventory") {
    state.pendingNotifications.push(
      `Contract for ${prod} with ${counterparty()}: zero units delivered this turn. Seller inventory empty.`
    );
  }
}

function executeContract(state: GameState, contract: Contract, proposals: BreachGateProposal[]): void {
  const { buyerParty, sellerParty, product, volumePerTurn, unitPrice } = contract;

  const sellerFirmId = sellerParty.firmId;
  const buyerFirmId = buyerParty.firmId;

  // ---- Harbor as seller ----
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

    postTransaction({
      state,
      turn: state.turn,
      firmId: buyerFirmId,
      corporationId: buyerParty.corporationId!,
      category: "input_cost",
      counterparty: "Harbor",
      product: product as ProductId,
      quantity: volumePerTurn,
      unitPrice,
      total: -total,
    });
    return;
  }

  // ---- Market buyer: goods leave seller to abstract market ----
  // Market has no corporation so no fine mechanism. Quality breach auto-terminates
  // after consecutive failures; volume shortfall tracked but no breach gate.
  if (buyerParty.type === "market") {
    if (!sellerFirmId) return;
    const sellerFirm = state.firms[sellerFirmId];
    if (!sellerFirm) return;

    const sellerQuality = getProductionLineQuality(sellerFirm, product);
    if (sellerQuality < contract.qualityThreshold) {
      contract.consecutiveQualityFailureTurns += 1;
      if (contract.consecutiveQualityFailureTurns >= GameConfig.contracts.qualityBreachConsecutiveTurns) {
        const prod = displayName(contract.product);
        state.pendingNotifications.push(
          `Market contract for ${prod} terminated: quality fell below ${(contract.qualityThreshold * 100).toFixed(0)}% for ${GameConfig.contracts.qualityBreachConsecutiveTurns} consecutive turns. The market has found another supplier.`
        );
        contract.status = "breached";
        scheduleMarketContractRenewal(state, contract);
        return;
      }
    } else {
      contract.consecutiveQualityFailureTurns = 0;
    }

    const { removed, unitCost } = removeFromInventory(sellerFirm.inventory, product, volumePerTurn);
    if (removed === 0) {
      notifyContractEvent(state, contract, "zeroinventory");
      contract.cumulativeVolumeShortfall += volumePerTurn;
    } else if (removed < volumePerTurn) {
      notifyContractEvent(state, contract, "partial");
      contract.cumulativeVolumeShortfall += (volumePerTurn - removed);
    } else {
      contract.cumulativeVolumeShortfall = 0;
    }

    if (contract.cumulativeVolumeShortfall >= GameConfig.contracts.volumeShortfallBreachThreshold) {
      const prod = displayName(contract.product);
      state.pendingNotifications.push(
        `Market contract for ${prod} terminated: cumulative volume shortfall of ${Math.round(contract.cumulativeVolumeShortfall)} units exceeded threshold. The market has found another supplier.`
      );
      contract.status = "breached";
      scheduleMarketContractRenewal(state, contract);
      return;
    }

    if (removed === 0) return;

    const revenue = removed * unitPrice;
    const sellerCorp = state.corporations[sellerParty.corporationId!];
    if (!sellerCorp) return;
    sellerCorp.cumulativeRevenue += revenue;

    postTransaction({
      state,
      turn: state.turn,
      firmId: sellerFirmId,
      corporationId: sellerParty.corporationId!,
      category: "revenue",
      counterparty: "Market contract",
      product: product as ProductId,
      quantity: removed,
      unitPrice,
      total: revenue,
    });

    if (unitCost > 0) {
      postTransaction({
        state,
        turn: state.turn,
        firmId: sellerFirmId,
        corporationId: sellerParty.corporationId!,
        category: "input_cost",
        counterparty: "Cost of goods sold (market contract)",
        product: product as ProductId,
        quantity: removed,
        unitPrice: unitCost,
        total: 0,
      });
    }

    checkMilestones(state, sellerParty.corporationId!);
    return;
  }

  // ---- Firm-to-firm ----
  if (sellerFirmId && buyerFirmId) {
    const sellerFirm = state.firms[sellerFirmId];
    const buyerFirm = state.firms[buyerFirmId];
    const sellerCorpId = sellerParty.corporationId ?? null;
    const buyerCorpId = buyerParty.corporationId ?? null;

    // ---- Quality breach tracking ----
    const sellerQuality = getProductionLineQuality(sellerFirm, product);
    if (sellerQuality < contract.qualityThreshold) {
      contract.consecutiveQualityFailureTurns += 1;
      if (
        contract.consecutiveQualityFailureTurns >= GameConfig.contracts.qualityBreachConsecutiveTurns &&
        buyerCorpId
      ) {
        handleBreachProposal(state, contract, proposals, "quality_failure", sellerFirm.name, buyerCorpId, sellerCorpId);
      }
    } else {
      contract.consecutiveQualityFailureTurns = 0;
    }

    const { removed, unitCost } = removeFromInventory(sellerFirm.inventory, product, volumePerTurn);
    if (removed === 0) {
      notifyContractEvent(state, contract, "zeroinventory");
      contract.cumulativeVolumeShortfall += volumePerTurn;
      if (contract.cumulativeVolumeShortfall >= GameConfig.contracts.volumeShortfallBreachThreshold && buyerCorpId) {
        handleBreachProposal(state, contract, proposals, "volume_shortfall", sellerFirm.name, buyerCorpId, sellerCorpId);
      }
      return;
    }

    if (removed < volumePerTurn) {
      notifyContractEvent(state, contract, "partial");
      contract.cumulativeVolumeShortfall += (volumePerTurn - removed);
      if (contract.cumulativeVolumeShortfall >= GameConfig.contracts.volumeShortfallBreachThreshold && buyerCorpId) {
        handleBreachProposal(state, contract, proposals, "volume_shortfall", sellerFirm.name, buyerCorpId, sellerCorpId);
      }
    } else {
      contract.cumulativeVolumeShortfall = 0;
    }

    const revenue = removed * unitPrice;
    const costBasis = removed * unitCost;

    addToInventory(buyerFirm.inventory, product, removed, unitPrice);

    postTransaction({
      state,
      turn: state.turn,
      firmId: sellerFirmId,
      corporationId: sellerCorpId,
      category: "revenue",
      counterparty: contract.isInternal ? `[Internal] ${buyerFirm.name}` : buyerFirm.name,
      product: product as ProductId,
      quantity: removed,
      unitPrice,
      total: revenue,
    });

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
        unitPrice,
        total: -revenue,
      });
    } else {
      postTransaction({
        state,
        turn: state.turn,
        firmId: buyerFirmId,
        corporationId: buyerCorpId,
        category: "input_cost",
        counterparty: `[Internal] ${sellerFirm.name}`,
        product: product as ProductId,
        quantity: removed,
        unitPrice: removed > 0 ? costBasis / removed : 0,
        total: 0,
      });
    }

    const sellerCorp = sellerCorpId ? state.corporations[sellerCorpId] : null;
    if (sellerCorp) {
      sellerCorp.cumulativeRevenue += revenue;
      if (sellerCorpId) checkMilestones(state, sellerCorpId);
    }
  }
}

// ============================================================
// Breach proposal helper
// ============================================================

/**
 * Route a breach condition to either a player gate proposal or AI auto-execution.
 * Deduplicates: only one proposal per contract per tick (stable gate ID based on contractId).
 */
function handleBreachProposal(
  state: GameState,
  contract: Contract,
  proposals: BreachGateProposal[],
  reason: BreachGateProposal["reason"],
  counterpartyName: string,
  harmedCorpId: string,
  sellerCorpId: string | null,
): void {
  // Already proposed this tick for this contract — skip
  if (proposals.some((p) => p.contractId === contract.id)) return;

  const harmedCorp = state.corporations[harmedCorpId];
  if (!harmedCorp) return;

  if (harmedCorp.isPlayer) {
    proposals.push({ contractId: contract.id, reason, counterpartyName, harmedCorpId, sellerCorpId });
  } else {
    // AI auto-handles: execute breach immediately
    executeBreachDeclaration(state, contract.id);
  }
}

// ============================================================
// Breach declaration and counter reset (exported for gate handlers)
// ============================================================

/**
 * Declare a breach on a contract: fine the seller, pay the buyer, terminate.
 * Returns notification strings for both parties. Called from gate handlers in gameStore.
 */
export function executeBreachDeclaration(state: GameState, contractId: string): string[] {
  const contract = state.contracts[contractId];
  if (!contract || contract.status !== "active") return [];

  const fine = GameConfig.contracts.breachFineAmount;
  const sellerCorpId = contract.sellerParty.corporationId;
  const buyerCorpId = contract.buyerParty.corporationId;
  const prod = displayName(contract.product);
  const msgs: string[] = [];

  if (sellerCorpId && buyerCorpId && contract.buyerParty.type !== "market") {
    const sellerCorp = state.corporations[sellerCorpId];
    const buyerCorp = state.corporations[buyerCorpId];

    if (sellerCorp && buyerCorp) {
      if (sellerCorp.isPlayer) {
        requireCash(sellerCorp, fine, `Contract breach fine — ${prod}`);
      } else if (sellerCorp.cash < fine) {
        eliminateCorporation(state, sellerCorp.id);
        contract.status = "breached";
        msgs.push(`Contract for ${prod} declared breached. ${sellerCorp.name} could not pay the fine and has been eliminated.`);
        return msgs;
      } else {
        sellerCorp.cash -= fine;
      }
      buyerCorp.cash += fine;

      postTransaction({
        state, turn: state.turn,
        firmId: contract.sellerParty.firmId,
        corporationId: sellerCorpId,
        category: "fine_payment",
        counterparty: buyerCorp.name,
        product: null, quantity: null, unitPrice: null,
        total: -fine,
      });
      postTransaction({
        state, turn: state.turn,
        firmId: contract.buyerParty.firmId,
        corporationId: buyerCorpId,
        category: "fine_payment",
        counterparty: sellerCorp.name,
        product: null, quantity: null, unitPrice: null,
        total: fine,
      });

      msgs.push(`Contract for ${prod} declared breached. ${sellerCorp.name} paid a fine of €${fine.toLocaleString()} to ${buyerCorp.name}.`);
    }
  } else {
    msgs.push(`Contract for ${prod} declared breached.`);
  }

  contract.status = "breached";
  return msgs;
}

/**
 * Reset breach condition counters on a contract (used when player chooses "Continue Contract").
 */
export function resetBreachCounters(state: GameState, contractId: string): void {
  const contract = state.contracts[contractId];
  if (!contract) return;
  contract.cumulativeVolumeShortfall = 0;
  contract.consecutiveQualityFailureTurns = 0;
}

function scheduleMarketContractRenewal(state: GameState, contract: Contract): void {
  if (contract.originType === "tender" && contract.originId) {
    const origTender = state.tenders[contract.originId];
    if (origTender) {
      state.pendingTenderRenewals.push({
        originalTenderId: contract.originId,
        scheduledForTurn: state.turn,
        incumbentCorporationId: contract.sellerParty.corporationId ?? null,
        productId: contract.product,
      });
    }
  }
}

// ============================================================
// Contract creation
// ============================================================

/** Create a new contract. Returns {error, id}. */
export function createContract(
  state: GameState,
  contract: Omit<Contract, "id" | "turnsExecuted" | "cumulativeVolumeShortfall" | "consecutiveQualityFailureTurns">,
  skipMilestoneCheck = false
): { error: string | null; id: string | null } {
  if (!skipMilestoneCheck && contract.durationTurns > 2) {
    const corpId =
      contract.buyerParty.corporationId ?? contract.sellerParty.corporationId ?? "";
    const corp = state.corporations[corpId];
    if (corp && !corp.multiYearContractsUnlocked) {
      return {
        error: "Multi-year contracts are locked until €100k cumulative revenue is reached.",
        id: null,
      };
    }
  }

  const id = generateId();
  state.contracts[id] = {
    ...contract, id, turnsExecuted: 0, lastBreachWarnTurn: 0,
    cumulativeVolumeShortfall: 0, consecutiveQualityFailureTurns: 0,
  };
  return { error: null, id };
}
