import type { GameState, MacroEvent, MacroEventType } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId, clamp } from "./utils";

/** Fire all pending macro events and move them to history. Returns event descriptions. */
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
        loan.annualInterestRate = clamp(
          loan.annualInterestRate + delta,
          0.01,
          0.25
        );
      }
      break;
    }

    case "recession": {
      // Stored as a game-level flag; retail engine reads it
      (state as GameState & { recessionTurnsRemaining?: number }).recessionTurnsRemaining =
        GameConfig.macroEvents.recessionDurationTurns;
      break;
    }

    case "commodity_price_shock": {
      const productId = event.payload.productId as string;
      const multiplier = event.payload.multiplier as number;
      if (productId in state.harborNode.prices) {
        (state.harborNode.prices as Record<string, number>)[productId] *= multiplier;
      }
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

/** Generate macro events that will fire at the start of the next turn. */
export function generateUpcomingEvents(state: GameState): void {
  const cfg = GameConfig.macroEvents;

  // Barcode event fires exactly once on the configured turn
  if (state.turn + 1 === GameConfig.game.barcodeAvailableTurn && !state.barcodeAvailable) {
    state.pendingEvents.push({
      id: generateId(),
      type: "barcode_scanning_available",
      turn: state.turn + 1,
      description: "Barcode scanning technology is now available. Invest to unlock inventory and logistics improvements.",
      payload: {},
      acknowledged: false,
    });
  }

  // Random macro events on check frequency
  if ((state.turn + 1) % cfg.checkFrequencyTurns !== 0) return;
  if (Math.random() > cfg.baseEventProbability) return;

  const eligibleTypes: MacroEventType[] = cfg.types.filter(
    (t) => t !== "barcode_scanning_available"
  );
  const type = eligibleTypes[Math.floor(Math.random() * eligibleTypes.length)];

  const event = buildRandomEvent(state, type);
  if (event) state.pendingEvents.push(event);
}

function buildRandomEvent(state: GameState, type: MacroEventType): MacroEvent | null {
  const id = generateId();
  const turn = state.turn + 1;

  switch (type) {
    case "interest_rate_change": {
      const min = GameConfig.loans.interestRateShockMin;
      const max = GameConfig.loans.interestRateShockMax;
      const delta = +(min + Math.random() * (max - min)).toFixed(3);
      const direction = delta >= 0 ? "risen" : "fallen";
      return {
        id, type, turn,
        description: `Interest rates have ${direction} by ${Math.abs(delta * 100).toFixed(1)}%.`,
        payload: { delta },
        acknowledged: false,
      };
    }

    case "recession": {
      return {
        id, type, turn,
        description: `A recession is underway. Consumer demand will fall for ${GameConfig.macroEvents.recessionDurationTurns} turns.`,
        payload: {},
        acknowledged: false,
      };
    }

    case "commodity_price_shock": {
      const products = Object.keys(state.harborNode.prices) as string[];
      const productId = products[Math.floor(Math.random() * products.length)];
      const min = GameConfig.harborPriceShockMin;
      const max = GameConfig.harborPriceShockMax;
      const multiplier = +(min + Math.random() * (max - min)).toFixed(3);
      const direction = multiplier >= 1 ? "risen" : "fallen";
      return {
        id, type, turn,
        description: `Harbor price for ${productId.replace(/_/g, " ")} has ${direction} sharply.`,
        payload: { productId, multiplier },
        acknowledged: false,
      };
    }

    case "tender_opportunity": {
      // Generate a market tender for aluminium (the main industrial output)
      const tender = buildMarketTender(state);
      return {
        id, type, turn,
        description: `A new market tender has appeared: ${tender.volumeRequired}t of aluminium.`,
        payload: { tender },
        acknowledged: false,
      };
    }

    case "tender_closure": {
      const openTenders = Object.values(state.tenders).filter((t) => t.status === "open");
      if (openTenders.length === 0) return null;
      const tender = openTenders[Math.floor(Math.random() * openTenders.length)];
      return {
        id, type, turn,
        description: `Market tender for ${tender.product.replace(/_/g, " ")} has closed unexpectedly.`,
        payload: { tenderId: tender.id },
        acknowledged: false,
      };
    }

    default:
      return null;
  }
}

function buildMarketTender(state: GameState): import("../types").Tender {
  const harborPrice = state.harborNode.prices["aluminium"];
  return {
    id: generateId(),
    direction: "market",
    publishedByCorporationId: null,
    product: "aluminium",
    volumeRequired: 100 + Math.floor(Math.random() * 400),
    targetUnitPrice: +(harborPrice * (1.05 + Math.random() * 0.15)).toFixed(2),
    minQuality: 0.5,
    durationTurns: 4,
    openTurn: state.turn + 1,
    closeTurn: state.turn + 5,
    status: "open",
    bids: [],
    awardedBids: [],
  };
}
