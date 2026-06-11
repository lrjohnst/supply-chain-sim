import type { GameState, Tender, TenderBid, ProductId } from "../types";
import { removeFromInventory, addToInventory, generateId } from "./utils";
import { postTransaction } from "./ledger";
import { checkMilestones } from "./milestones";

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

  // Sort bids: lowest price wins for buyer (market tender),
  // highest price wins for seller (player sourcing tender)
  const sortedBids = [...tender.bids].sort((a, b) =>
    tender.direction === "market"
      ? a.unitPrice - b.unitPrice   // seller competition: lowest offer
      : b.unitPrice - a.unitPrice   // buyer competition: highest offer
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
}

function executeTenderAward(state: GameState, tender: Tender, bid: TenderBid): void {
  const firm = state.firms[bid.firmId];
  if (!firm) return;

  if (tender.direction === "market") {
    // Player/AI sells output to the market
    const { removed, unitCost: _ } = removeFromInventory(
      firm.inventory,
      tender.product,
      bid.volumeOffered
    );
    if (removed === 0) return;

    const revenue = removed * bid.unitPrice;
    const corp = state.corporations[bid.corporationId];
    corp.cumulativeRevenue += revenue;

    postTransaction({
      state,
      turn: state.turn,
      firmId: firm.id,
      corporationId: bid.corporationId,
      category: "revenue",
      counterparty: "Market tender",
      product: tender.product as ProductId,
      quantity: removed,
      unitPrice: bid.unitPrice,
      total: revenue,
    });

    // Check milestone
    checkMilestones(state, bid.corporationId);
  } else {
    // Player-sourcing tender: player buys inputs
    // Seller is harbor or rival
    const buyerFirmId = tender.publishedByCorporationId
      ? Object.values(state.firms).find(
          (f) =>
            f.corporationId === tender.publishedByCorporationId &&
            f.activeTenderIds.includes(tender.id)
        )?.id
      : null;

    if (!buyerFirmId) return;

    const buyerFirm = state.firms[buyerFirmId];
    const cost = bid.volumeOffered * bid.unitPrice;

    addToInventory(buyerFirm.inventory, tender.product, bid.volumeOffered, bid.unitPrice);

    postTransaction({
      state,
      turn: state.turn,
      firmId: buyerFirmId,
      corporationId: buyerFirm.corporationId,
      category: "input_cost",
      counterparty: bid.corporationId === "harbor" ? "Harbor" : state.corporations[bid.corporationId]?.name ?? "Supplier",
      product: tender.product as ProductId,
      quantity: bid.volumeOffered,
      unitPrice: bid.unitPrice,
      total: -cost,
    });
  }
}

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

  const bid: TenderBid = {
    corporationId: firm.corporationId,
    firmId,
    volumeOffered,
    unitPrice,
    qualityOffered: firm.quality,
    submittedTurn: state.turn,
  };

  if (existing >= 0) {
    tender.bids[existing] = bid; // replace existing bid
  } else {
    tender.bids.push(bid);
  }

  return null;
}

