import type { GameState, MacroEvent, MacroEventType, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";
import { getHarborSoldProducts, createHarborShock } from "./harbor";
import { displayName } from "./products";

// ============================================================
// Fire pending events
// ============================================================

/** Apply all pending macro events and move them to history. Returns fired events. */
export function firePendingEvents(state: GameState): MacroEvent[] {
  const fired: MacroEvent[] = [];

  for (const event of state.pendingEvents) {
    applyEvent(state, event);
    event.acknowledged = false;
    state.eventHistory.push(event);
    fired.push(event);
  }

  state.pendingEvents = [];
  return fired;
}

function applyEvent(state: GameState, event: MacroEvent): void {
  switch (event.type) {
    case "interest_rate_change": {
      const delta = event.payload.delta as number;
      for (const loan of Object.values(state.loans)) {
        loan.annualInterestRate = Math.min(
          0.25,
          Math.max(0.01, loan.annualInterestRate + delta)
        );
      }
      state.currentBaseInterestRate = Math.min(
        0.25,
        Math.max(0.01, state.currentBaseInterestRate + delta)
      );
      break;
    }

    case "recession": {
      // No stacking: discard silently if a recession is already active.
      if (state.recessionTurnsRemaining > 0) break;

      const cfg = GameConfig.recessionEvents;
      const duration =
        cfg.durationMin +
        Math.floor(Math.random() * (cfg.durationMax - cfg.durationMin + 1));
      state.recessionTurnsRemaining = duration;

      // Draw severity: uniform between min/max (skew=0 for MVP).
      // Non-zero skew is stored in config for future use but not yet applied.
      state.recessionSeverity =
        cfg.severityMin + Math.random() * (cfg.severityMax - cfg.severityMin);
      break;
    }

    case "commodity_price_shock": {
      const productId = event.payload.productId as ProductId;
      const multiplier = event.payload.multiplier as number;
      // Delegate to harbor.ts — it owns shock state.
      createHarborShock(state, productId, multiplier);
      break;
    }

    case "tender_opportunity": {
      const tender = event.payload.tender as import("../types").Tender;
      state.tenders[tender.id] = tender;
      break;
    }

    case "tender_closure": {
      const tenderId = event.payload.tenderId as string;
      if (state.tenders[tenderId]) {
        state.tenders[tenderId].status = "closed";
      }
      break;
    }

    case "barcode_scanning_available": {
      state.barcodeAvailable = true;
      break;
    }
  }
}

// ============================================================
// Generate upcoming events
// Each event category has its own independent check frequency
// and probability — they do not share a pool.
// ============================================================

/** Queue events that will fire at the start of the next turn. */
export function generateUpcomingEvents(state: GameState): void {
  const nextTurn = state.turn + 1;

  // ---- Barcode (fires exactly once) ----
  if (nextTurn === GameConfig.game.barcodeAvailableTurn && !state.barcodeAvailable) {
    state.pendingEvents.push({
      id: generateId(),
      type: "barcode_scanning_available",
      turn: nextTurn,
      description:
        "Barcode scanning technology is now available. Invest to unlock inventory and logistics improvements.",
      payload: {},
      acknowledged: false,
    });
  }

  // ---- Recession ----
  const recCfg = GameConfig.recessionEvents;
  if (
    nextTurn % recCfg.checkFrequencyTurns === 0 &&
    Math.random() < recCfg.probability &&
    state.recessionTurnsRemaining === 0 &&
    state.recessionCooldownRemaining === 0
  ) {
    const durationMin = recCfg.durationMin;
    const durationMax = recCfg.durationMax;
    const duration =
      durationMin + Math.floor(Math.random() * (durationMax - durationMin + 1));
    state.pendingEvents.push({
      id: generateId(),
      type: "recession",
      turn: nextTurn,
      description: `A recession is underway. Consumer demand will fall for up to ${duration} turns.`,
      payload: {},
      acknowledged: false,
    });
  }

  // ---- Commodity price shock ----
  const shockCfg = GameConfig.commodityShockEvents;
  if (
    nextTurn % shockCfg.checkFrequencyTurns === 0 &&
    Math.random() < shockCfg.probability
  ) {
    const eligible = getHarborSoldProducts();
    if (eligible.length > 0) {
      const productId = eligible[Math.floor(Math.random() * eligible.length)];
      const multiplier = +(
        shockCfg.shockMultiplierMin +
        Math.random() * (shockCfg.shockMultiplierMax - shockCfg.shockMultiplierMin)
      ).toFixed(3);
      const direction = multiplier >= 1 ? "risen" : "fallen";
      state.pendingEvents.push({
        id: generateId(),
        type: "commodity_price_shock",
        turn: nextTurn,
        description: `Harbor price for ${displayName(productId)} has ${direction} sharply.`,
        payload: { productId, multiplier },
        acknowledged: false,
      });
    }
  }

  // ---- Interest rate change ----
  const irCfg = GameConfig.interestRateEvents;
  if (
    nextTurn % irCfg.checkFrequencyTurns === 0 &&
    Math.random() < irCfg.probability
  ) {
    const delta = +(
      irCfg.shockMin + Math.random() * (irCfg.shockMax - irCfg.shockMin)
    ).toFixed(3);
    const direction = delta >= 0 ? "risen" : "fallen";
    state.pendingEvents.push({
      id: generateId(),
      type: "interest_rate_change",
      turn: nextTurn,
      description: `Interest rates have ${direction} by ${Math.abs(delta * 100).toFixed(1)}%.`,
      payload: { delta },
      acknowledged: false,
    });
  }

  // ---- Tender opportunity ----
  const tenderCfg = GameConfig.tenderEvents;
  if (
    nextTurn % tenderCfg.checkFrequencyTurns === 0 &&
    Math.random() < tenderCfg.probability
  ) {
    const tender = buildMarketTender(state);
    state.pendingEvents.push({
      id: generateId(),
      type: "tender_opportunity",
      turn: nextTurn,
      description: `A new market tender has appeared: ${tender.volumeRequired}t of aluminium.`,
      payload: { tender },
      acknowledged: false,
    });
  }

  // ---- Tender closure ----
  if (
    nextTurn % tenderCfg.checkFrequencyTurns === 0 &&
    Math.random() < tenderCfg.probability * 0.5  // closure is less common
  ) {
    const openTenders = Object.values(state.tenders).filter((t) => t.status === "open");
    if (openTenders.length > 0) {
      const tender = openTenders[Math.floor(Math.random() * openTenders.length)];
      state.pendingEvents.push({
        id: generateId(),
        type: "tender_closure",
        turn: nextTurn,
        description: `Market tender for ${displayName(tender.product)} has closed unexpectedly.`,
        payload: { tenderId: tender.id },
        acknowledged: false,
      });
    }
  }
}

// ============================================================
// Helpers
// ============================================================

function buildMarketTender(state: GameState): import("../types").Tender {
  const harborPrice = state.harborNode.prices["aluminium"] || 195;
  const cfg = GameConfig.tenders;
  return {
    id: generateId(),
    direction: "market",
    publishedByCorporationId: null,
    publishedByFirmId: null,
    product: "aluminium",
    volumeRequired: 100 + Math.floor(Math.random() * 400),
    targetUnitPrice: +(harborPrice * (1.05 + Math.random() * 0.15)).toFixed(2),
    minQuality: GameConfig.tenderEvents.minQuality,
    durationTurns: 4,
    openTurn: state.turn + 1,
    closeTurn: state.turn + 5,
    status: "open",
    bids: [],
    awardedBids: [],
    contractDurationTurns: cfg.contractDurationTurns,
    renewalGapTurns: cfg.renewalGapTurns,
    cycleNumber: 1,
    previousTenderId: null,
    qualityDriftPerCycle: cfg.qualityDriftPerCycle,
    volumeGrowthFactor: 1.0,
    incumbentCorporationId: null,
    incumbentNoticeGiven: false,
  };
}
