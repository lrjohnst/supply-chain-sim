import type { GameState, FirmBooks, CorporateBooks } from "../types";
import { corporationNetWorth } from "./utils";
import { corporationTurnTransactions, firmTurnTransactions } from "./ledger";

/** Compute firm-level P&L for a given turn. */
export function computeFirmBooks(state: GameState, firmId: string, turn: number): FirmBooks {
  const lines = firmTurnTransactions(state, firmId, turn);

  let revenue = 0;
  let inputCosts = 0;
  let operatingCosts = 0;

  for (const tx of lines) {
    if (tx.total === 0) continue; // internal cost-basis transfers
    switch (tx.category) {
      case "revenue":
        revenue += tx.total;
        break;
      case "input_cost":
        inputCosts += Math.abs(tx.total);
        break;
      case "operating_cost":
      case "investment_cost":
        operatingCosts += Math.abs(tx.total);
        break;
    }
  }

  return {
    firmId,
    turn,
    revenue,
    inputCosts,
    operatingCosts,
    netProfit: revenue - inputCosts - operatingCosts,
    lines,
  };
}

/** Compute consolidated corporate P&L and net worth for a given turn. */
export function computeCorporateBooks(
  state: GameState,
  corporationId: string,
  turn: number
): CorporateBooks {
  const corp = state.corporations[corporationId];
  const allLines = corporationTurnTransactions(state, corporationId, turn);

  let revenue = 0;
  let inputCosts = 0;
  let operatingCosts = 0;
  let loanInterest = 0;

  for (const tx of allLines) {
    if (tx.total === 0) continue;
    switch (tx.category) {
      case "revenue":
        revenue += tx.total;
        break;
      case "input_cost":
        inputCosts += Math.abs(tx.total);
        break;
      case "operating_cost":
      case "investment_cost":
      case "training_cost":
      case "marketing_cost":
      case "transport_cost":
        operatingCosts += Math.abs(tx.total);
        break;
      case "loan_interest":
        loanInterest += Math.abs(tx.total);
        break;
      case "loan_repayment":
        // repayment is balance sheet, not P&L
        break;
    }
  }

  const firmBooks = corp.firmIds.map((id) => computeFirmBooks(state, id, turn));

  return {
    corporationId,
    turn,
    revenue,
    inputCosts,
    operatingCosts,
    loanInterest,
    netProfit: revenue - inputCosts - operatingCosts - loanInterest,
    netWorth: corporationNetWorth(state, corporationId),
    firmBooks,
    lines: allLines,
  };
}
