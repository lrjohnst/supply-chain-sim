import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";
import { postTransaction } from "./ledger";
import { requireCash, eliminateCorporation } from "./bankruptcy";

/** Total asset value for a corporation: cash + investments at cost + inventory at cost. */
export function computeTotalAssets(state: GameState, corporationId: string): number {
  const corp = state.corporations[corporationId];
  let assets = corp.cash;
  for (const firmId of corp.firmIds) {
    const firm = state.firms[firmId];
    for (const inv of firm.investments) assets += inv.costPaid;
    for (const line of firm.inventory) assets += line.quantity * line.unitCost;
  }
  return assets;
}

/** Maximum outstanding balance the corporation may carry. */
export function getCreditLimit(state: GameState, corporationId: string): number {
  const cfg = GameConfig.loans;
  const totalAssets = computeTotalAssets(state, corporationId);
  return Math.max(totalAssets, cfg.minAssetFloorForLoan) * cfg.leverageRatioOnAssets;
}

/** Returns the single revolving credit facility for a corporation, or null if not initialised. */
export function getCreditFacility(state: GameState, corporationId: string) {
  const corp = state.corporations[corporationId];
  if (!corp || corp.loanIds.length === 0) return null;
  return state.loans[corp.loanIds[0]] ?? null;
}

/**
 * Each turn: update the facility rate from the current base rate, then
 * accrue interest on the outstanding balance. Interest is posted to the
 * ledger and deducted from corporation cash. Inability to pay triggers
 * bankruptcy (player) or elimination (AI).
 */
export function processLoans(state: GameState): void {
  for (const loan of Object.values(state.loans)) {
    // Sync rate to current macro rate (revolving credit is always variable)
    loan.annualInterestRate = state.currentBaseInterestRate;

    if (loan.outstandingBalance <= 0) continue;

    const quarterlyRate = loan.annualInterestRate / GameConfig.game.quartersPerYear;
    const interest = loan.outstandingBalance * quarterlyRate;
    if (interest <= 0) continue;

    const corp = state.corporations[loan.corporationId];
    if (!corp || corp.eliminated) continue;

    if (corp.isPlayer) {
      requireCash(corp, interest, `Credit facility interest (${(loan.annualInterestRate * 100).toFixed(1)}% p.a. on ${Math.round(loan.outstandingBalance).toLocaleString()})`);
    } else if (corp.cash < interest) {
      eliminateCorporation(state, corp.id);
      continue;
    }

    corp.cash -= interest;

    postTransaction({
      state,
      turn: state.turn,
      firmId: null,
      corporationId: loan.corporationId,
      category: "loan_interest",
      counterparty: "Bank",
      product: null,
      quantity: null,
      unitPrice: null,
      total: -interest,
    });
  }
}

/**
 * Draw from the revolving credit facility.
 * Validates against the credit limit; adds to outstanding balance and cash.
 */
export function drawCredit(
  state: GameState,
  corporationId: string,
  amount: number,
): string | null {
  if (amount <= 0) return "Draw amount must be positive.";

  const facility = getCreditFacility(state, corporationId);
  if (!facility) return "No credit facility found.";

  const limit = getCreditLimit(state, corporationId);
  const available = limit - facility.outstandingBalance;
  if (amount > available + 0.01) {
    return `Cannot draw €${Math.round(amount).toLocaleString()} — available credit is €${Math.round(available).toLocaleString()}.`;
  }

  const corp = state.corporations[corporationId];
  facility.outstandingBalance += amount;
  facility.principal += amount;
  corp.cash += amount;

  postTransaction({
    state,
    turn: state.turn,
    firmId: null,
    corporationId,
    category: "loan_draw",
    counterparty: "Bank",
    product: null,
    quantity: null,
    unitPrice: null,
    total: amount,
  });

  return null;
}

/**
 * Repay any portion of the outstanding credit balance.
 * Validates against available cash and outstanding balance.
 */
export function repayCredit(
  state: GameState,
  corporationId: string,
  amount: number,
): string | null {
  if (amount <= 0) return "Repayment amount must be positive.";

  const facility = getCreditFacility(state, corporationId);
  if (!facility) return "No credit facility found.";

  if (facility.outstandingBalance <= 0) return "Nothing to repay.";

  const maxRepay = Math.min(facility.outstandingBalance, state.corporations[corporationId].cash);
  if (amount > maxRepay + 0.01) {
    return `Cannot repay €${Math.round(amount).toLocaleString()} — maximum is €${Math.round(maxRepay).toLocaleString()}.`;
  }

  const repaid = Math.min(amount, facility.outstandingBalance);
  const corp = state.corporations[corporationId];
  facility.outstandingBalance -= repaid;
  corp.cash -= repaid;

  if (facility.outstandingBalance < 0.01) facility.outstandingBalance = 0;

  postTransaction({
    state,
    turn: state.turn,
    firmId: null,
    corporationId,
    category: "loan_repayment",
    counterparty: "Bank",
    product: null,
    quantity: null,
    unitPrice: null,
    total: -repaid,
  });

  return null;
}
