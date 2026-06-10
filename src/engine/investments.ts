import type { GameState, Firm, Investment, InvestmentType } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";
import { postTransaction } from "./ledger";

/** Advance all in-progress investments by one turn. */
export function advanceInvestments(state: GameState): void {
  for (const firm of Object.values(state.firms)) {
    for (const inv of firm.investments) {
      if (inv.status === "in_progress") {
        inv.turnsRemaining -= 1;
        if (inv.turnsRemaining <= 0) {
          inv.status = "complete";
          inv.turnsRemaining = 0;
        }
      }
    }
  }
}

/** Start a new investment in a firm. Returns error string or null on success. */
export function startInvestment(
  state: GameState,
  firmId: string,
  type: InvestmentType
): string | null {
  const firm = state.firms[firmId];
  if (!firm) return "Firm not found.";

  const corp = state.corporations[firm.corporationId];

  // Slot limit check
  const activeCount = firm.investments.filter(
    (i) => i.status !== "not_built"
  ).length;
  if (activeCount >= GameConfig.firmInvestmentSlotLimit) {
    return "No investment slots remaining in this firm.";
  }

  // Max-per-firm check
  const maxAllowed = GameConfig.investments.maxPerFirm[type];
  const existingCount = firm.investments.filter((i) => i.type === type).length;
  if (existingCount >= maxAllowed) {
    return `Maximum number of ${type} investments already built.`;
  }

  // Barcode check: only available after the event fires
  if (type === "barcode_scanning" && !state.barcodeAvailable) {
    return "Barcode scanning is not yet available.";
  }

  const cost = GameConfig.investments.cost[type];
  if (corp.cash < cost) {
    return `Insufficient funds. Required: €${cost.toLocaleString()}.`;
  }

  const inv: Investment = {
    id: generateId(),
    type,
    status: "in_progress",
    turnsRemaining: GameConfig.investments.buildTurns[type],
    costPaid: cost,
  };

  firm.investments.push(inv);

  postTransaction({
    state,
    turn: state.turn,
    firmId: firm.id,
    corporationId: firm.corporationId,
    category: "investment_cost",
    counterparty: "Capital expenditure",
    product: null,
    quantity: null,
    unitPrice: null,
    total: -cost,
  });

  return null;
}

/** Check whether a firm has a completed investment of the given type. */
export function hasInvestment(firm: Firm, type: InvestmentType): boolean {
  return firm.investments.some((i) => i.type === type && i.status === "complete");
}

/** Count completed investments of a given type in a firm. */
export function countInvestment(firm: Firm, type: InvestmentType): number {
  return firm.investments.filter((i) => i.type === type && i.status === "complete").length;
}
