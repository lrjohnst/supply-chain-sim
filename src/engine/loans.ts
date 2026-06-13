import type { GameState, Loan } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";
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

/** Accrue interest and process quarterly loan payments. */
export function processLoans(state: GameState): void {
  for (const loan of Object.values(state.loans)) {
    if (loan.outstandingBalance <= 0) continue;

    const quartersPerYear = GameConfig.game.quartersPerYear;
    const quarterlyRate = loan.annualInterestRate / quartersPerYear;
    const turnsRemaining = loan.durationTurns - (state.turn - loan.turnTaken);

    // Recalculate payment each turn from current rate + remaining balance + remaining turns.
    // This makes existing loans variable-rate: a rate shock immediately changes the payment.
    const quarterlyPayment =
      turnsRemaining > 0
        ? quarterlyRate > 0
          ? (loan.outstandingBalance * quarterlyRate) /
            (1 - Math.pow(1 + quarterlyRate, -turnsRemaining))
          : loan.outstandingBalance / turnsRemaining
        : loan.outstandingBalance; // final turn: repay remainder in full

    const interest = loan.outstandingBalance * quarterlyRate;
    const principal = quarterlyPayment - interest;
    const principalRepaid = Math.min(Math.max(principal, 0), loan.outstandingBalance);
    const totalDue = interest + principalRepaid;

    const corp = state.corporations[loan.corporationId];
    if (!corp || corp.eliminated) continue;

    if (corp.isPlayer) {
      requireCash(corp, totalDue, `Loan repayment (€${Math.round(interest).toLocaleString()} interest + €${Math.round(principalRepaid).toLocaleString()} principal)`);
    } else if (corp.cash < totalDue) {
      eliminateCorporation(state, corp.id);
      continue;
    }

    // Post interest expense
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

    // Post principal repayment

    if (principalRepaid > 0) {
      loan.outstandingBalance -= principalRepaid;

      postTransaction({
        state,
        turn: state.turn,
        firmId: null,
        corporationId: loan.corporationId,
        category: "loan_repayment",
        counterparty: "Bank",
        product: null,
        quantity: null,
        unitPrice: null,
        total: -principalRepaid,
      });
    }

    // Close out and remove the loan when balance is negligible
    if (loan.outstandingBalance < 0.01) {
      loan.outstandingBalance = 0;
      delete state.loans[loan.id];
      const loanCorp = state.corporations[loan.corporationId];
      if (loanCorp) loanCorp.loanIds = loanCorp.loanIds.filter((id) => id !== loan.id);
    }
  }
}

/** Take out a new loan. Returns error string or null on success. */
export function takeLoan(
  state: GameState,
  corporationId: string,
  principal: number,
  durationTurns: number
): string | null {
  const corp = state.corporations[corporationId];
  const cfg = GameConfig.loans;

  if (durationTurns < cfg.minDurationTurns || durationTurns > cfg.maxDurationTurns) {
    return `Loan duration must be between ${cfg.minDurationTurns} and ${cfg.maxDurationTurns} turns.`;
  }

  const totalAssets = computeTotalAssets(state, corporationId);
  const maxLoan = Math.max(totalAssets, cfg.minAssetFloorForLoan) * cfg.leverageRatioOnAssets;
  if (principal > maxLoan) {
    return `Maximum loan amount is €${Math.round(maxLoan).toLocaleString()} (${cfg.leverageRatioOnAssets}× total assets).`;
  }

  const currentRate = state.currentBaseInterestRate;
  const quarterlyRate = currentRate / GameConfig.game.quartersPerYear;

  // Fixed payment annuity formula
  const quarterlyPayment =
    quarterlyRate > 0
      ? (principal * quarterlyRate) / (1 - Math.pow(1 + quarterlyRate, -durationTurns))
      : principal / durationTurns;

  const loan: Loan = {
    id: generateId(),
    corporationId,
    principal,
    outstandingBalance: principal,
    annualInterestRate: currentRate,
    quarterlyPayment: +quarterlyPayment.toFixed(2),
    turnTaken: state.turn,
    durationTurns,
  };

  state.loans[loan.id] = loan;
  corp.loanIds.push(loan.id);
  corp.cash += principal;

  return null;
}
