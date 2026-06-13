import type { GameState, Tender, TenderBid, ProductId, ContractParty } from "../types";
import { generateId } from "./utils";
import { displayName } from "./products";
import { getProductionLineQuality } from "./operatingCosts";
import { getBasePrice } from "./harbor";
import { createContract } from "./contracts";
import { GameConfig } from "../config/gameConfig";

// ============================================================
// Per-turn tender evaluation
// ============================================================

/** Evaluate all open tenders: award bids, execute fulfilled tenders. */
export function evaluateTenders(state: GameState): void {
  for (const tender of Object.values(state.tenders)) {
    if (tender.status !== "open") continue;
    if (state.turn < tender.closeTurn) continue;

    awardTender(state, tender);
  }
}

function awardTender(state: GameState, tender: Tender): void {
  if (tender.bids.length === 0) {
    tender.status = "expired";
    return;
  }

  const sortedBids = [...tender.bids].sort((a, b) =>
    tender.direction === "market"
      ? a.unitPrice - b.unitPrice
      : b.unitPrice - a.unitPrice
  );

  let remainingVolume = tender.volumeRequired;

  for (const bid of sortedBids) {
    if (remainingVolume <= 0) break;
    if (bid.qualityOffered < tender.minQuality) continue;

    const volumeAwarded = Math.min(bid.volumeOffered, remainingVolume);
    const awardedBid: TenderBid = { ...bid, volumeOffered: volumeAwarded };
    tender.awardedBids.push(awardedBid);
    remainingVolume -= volumeAwarded;

    executeTenderAward(state, tender, awardedBid);
  }

  tender.status = remainingVolume > 0 ? "expired" : "awarded";

  notifyTenderOutcomes(state, tender);
}

function notifyTenderOutcomes(state: GameState, tender: Tender): void {
  const playerCorp = Object.values(state.corporations).find((c) => c.isPlayer);
  if (!playerCorp) return;

  const playerBids = tender.bids.filter((b) => b.corporationId === playerCorp.id);
  if (playerBids.length === 0) return;

  const prod = displayName(tender.product as ProductId);

  for (const bid of playerBids) {
    const awarded = tender.awardedBids.find((ab) => ab.firmId === bid.firmId);
    if (!awarded) {
      state.pendingNotifications.push(`Tender bid unsuccessful for ${prod}.`);
    }
    // Win notification is pushed inside executeTenderAward for winning bidders.
  }
}

/**
 * Award a tender bid by creating a supply contract.
 * No inventory removal or revenue posting at award time —
 * that happens each turn as the contract executes in contracts.ts.
 */
function executeTenderAward(state: GameState, tender: Tender, bid: TenderBid): void {
  const firm = state.firms[bid.firmId];
  if (!firm) return;

  const sellerParty: ContractParty = {
    type: "corporation",
    corporationId: bid.corporationId,
    firmId: bid.firmId,
  };

  const buyerParty: ContractParty =
    tender.direction === "market"
      ? { type: "market", corporationId: null, firmId: null }
      : {
          type: "corporation",
          corporationId: tender.publishedByCorporationId,
          firmId: tender.publishedByFirmId,
        };

  createContract(
    state,
    {
      status: "active",
      buyerParty,
      sellerParty,
      product: tender.product,
      volumePerTurn: bid.volumeOffered,
      unitPrice: bid.unitPrice,
      qualityThreshold: tender.minQuality,
      deliveryTurns: tender.contractDurationTurns,
      startTurn: state.turn + 1,
      durationTurns: tender.contractDurationTurns,
      isInternal: false,
      originId: tender.id,
      originType: "tender",
      incumbentNoticeGiven: false,
      lastBreachWarnTurn: 0,
    },
    true // skipMilestoneCheck — tender contracts bypass the multi-year revenue gate
  );

  // Notify winning player
  const winningCorp = state.corporations[bid.corporationId];
  if (winningCorp?.isPlayer) {
    const prod = displayName(tender.product as ProductId);
    state.pendingNotifications.push(
      `Tender awarded: supply contract for ${Math.round(bid.volumeOffered)} units of ${prod} ` +
      `per turn at €${bid.unitPrice.toFixed(2)}/u for ${tender.contractDurationTurns} turns. ` +
      `First delivery next turn.`
    );
  }
}

// ============================================================
// Renewal cycle
// ============================================================

/**
 * Process any tender renewals due this turn.
 * Called after executeContracts so this-turn completions are already scheduled.
 */
export function processRenewals(state: GameState): void {
  const cfg = GameConfig.tenders;
  const due = state.pendingTenderRenewals.filter((r) => r.scheduledForTurn <= state.turn);
  state.pendingTenderRenewals = state.pendingTenderRenewals.filter(
    (r) => r.scheduledForTurn > state.turn
  );

  for (const renewal of due) {
    const origTender = state.tenders[renewal.originalTenderId];
    if (!origTender) continue;

    // Draw volume growth factor from normal distribution (Box-Muller transform)
    const u1 = Math.max(1e-10, Math.random());
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const growthFactor = Math.max(0.5, cfg.volumeGrowthMean + z * cfg.volumeGrowthStdDev);
    const newVolume = Math.max(50, Math.round(origTender.volumeRequired * growthFactor));

    const newMinQuality = Math.min(1.0, origTender.minQuality + origTender.qualityDriftPerCycle);

    const harborPrice =
      (state.harborNode.prices as Record<string, number>)[renewal.productId] ??
      getBasePrice(renewal.productId as ProductId);
    const targetPrice = +(harborPrice * (1.05 + Math.random() * 0.1)).toFixed(2);

    const id = generateId();
    const renewalTender: Tender = {
      id,
      direction: origTender.direction,
      publishedByCorporationId: origTender.publishedByCorporationId,
      publishedByFirmId: origTender.publishedByFirmId,
      product: renewal.productId,
      volumeRequired: newVolume,
      targetUnitPrice: targetPrice,
      minQuality: newMinQuality,
      durationTurns: origTender.renewalGapTurns,
      openTurn: state.turn,
      closeTurn: state.turn + origTender.renewalGapTurns,
      status: "open",
      bids: [],
      awardedBids: [],
      contractDurationTurns: origTender.contractDurationTurns,
      renewalGapTurns: origTender.renewalGapTurns,
      cycleNumber: origTender.cycleNumber + 1,
      previousTenderId: origTender.id,
      qualityDriftPerCycle: origTender.qualityDriftPerCycle,
      volumeGrowthFactor: growthFactor,
      incumbentCorporationId: renewal.incumbentCorporationId,
      incumbentNoticeGiven: false,
    };
    state.tenders[id] = renewalTender;

    // Notify incumbent (player only)
    if (renewal.incumbentCorporationId) {
      const incumbentCorp = state.corporations[renewal.incumbentCorporationId];
      if (incumbentCorp?.isPlayer) {
        const prod = displayName(renewal.productId as ProductId);
        state.pendingNotifications.push(
          `Renewal tender posted for ${prod}. ` +
          `Cycle ${renewalTender.cycleNumber} — ${newVolume}u/turn, ` +
          `min quality ${(newMinQuality * 100).toFixed(0)}%, ` +
          `closes in ${origTender.renewalGapTurns} turns. You have incumbent status.`
        );
      }
    }
  }
}

// ============================================================
// Bid submission and withdrawal
// ============================================================

/** Submit a bid on an open tender. Returns error string or null on success. */
export function submitTenderBid(
  state: GameState,
  tenderId: string,
  firmId: string,
  volumeOffered: number,
  unitPrice: number
): string | null {
  const tender = state.tenders[tenderId];
  if (!tender) return "Tender not found.";
  if (tender.status !== "open") return "Tender is not open for bids.";
  if (state.turn >= tender.closeTurn) return "Tender bidding period has closed.";

  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  const existing = tender.bids.findIndex(
    (b) => b.corporationId === firm.corporationId && b.firmId === firmId
  );

  // Post-MVP: re-evaluate quality at award time or average over bid period
  // to prevent a quality decay exploit (bid at high quality, decay before award).
  const bid: TenderBid = {
    corporationId: firm.corporationId,
    firmId,
    volumeOffered,
    unitPrice,
    qualityOffered: getProductionLineQuality(firm, tender.product as ProductId),
    submittedTurn: state.turn,
  };

  // Post-MVP: consider bid deposits or inventory reservation to prevent award
  // shortfalls between bid submission and close turn.

  if (existing >= 0) {
    tender.bids[existing] = bid;
  } else {
    tender.bids.push(bid);
  }

  return null;
}

/** Withdraw the player's bid from an open tender. */
export function withdrawTenderBid(
  state: GameState,
  tenderId: string,
  corporationId: string
): string | null {
  const tender = state.tenders[tenderId];
  if (!tender) return "Tender not found.";
  if (tender.status !== "open") return "Tender is no longer open.";

  const before = tender.bids.length;
  tender.bids = tender.bids.filter((b) => b.corporationId !== corporationId);
  if (tender.bids.length === before) return "No bid found to withdraw.";
  return null;
}
