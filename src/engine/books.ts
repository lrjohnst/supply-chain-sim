import type { GameState, FirmBooks, CorporateBooks } from "../types";
import { corporationNetWorth } from "./utils";
import { corporationTurnTransactions, firmTurnTransactions } from "./ledger";

/** Compute firm-level P&L for a given turn. */
export function computeFirmBooks(state: GameState, firmId: string, turn: number): FirmBooks {
  const lines = firmTurnTransactions(state, firmId, turn);

  let revenue = 0;
  let inputCosts = 0;
  let overheadCosts = 0;
  let operatingCosts = 0;
  let capitalExpenditure = 0;

  // Loan interest and repayment are intentionally absent here. Loans belong to corporations, not firms.
  for (const tx of lines) {
    if (tx.total === 0) continue; // internal cost-basis transfers and COGS records
    switch (tx.category) {
      case "revenue":
        revenue += tx.total;
        break;
      case "input_cost":
        inputCosts += Math.abs(tx.total);
        break;
      case "overhead":
        overheadCosts += Math.abs(tx.total);
        break;
      case "operating_cost":
        // Includes investment operating costs, startup/commissioning costs.
        // Note: startup costs are posted as operating_cost, not a separate category.
        operatingCosts += Math.abs(tx.total);
        break;
      case "training_cost":
        // Per-firm training cost — posted at firm level since the training redesign.
        operatingCosts += Math.abs(tx.total);
        break;
      case "transport_cost":
        // transport_cost is a firm-level category; buckets here when posted.
        operatingCosts += Math.abs(tx.total);
        break;
      case "investment_cost":
        capitalExpenditure += Math.abs(tx.total);
        break;
      // marketing_cost is corporate-level only — will not appear in firm transactions.
      // loan_interest and loan_repayment are corporate-level only — intentionally absent.
    }
  }

  return {
    firmId,
    turn,
    revenue,
    inputCosts,
    overheadCosts,
    operatingCosts,
    capitalExpenditure,
    netProfit: revenue - inputCosts - overheadCosts - operatingCosts - capitalExpenditure,
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
  let overheadCosts = 0;
  let operatingCosts = 0;
  let capitalExpenditure = 0;
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
      case "overhead":
        overheadCosts += Math.abs(tx.total);
        break;
      case "operating_cost":
      case "training_cost":
      case "marketing_cost":
      case "transport_cost":
        operatingCosts += Math.abs(tx.total);
        break;
      case "investment_cost":
        capitalExpenditure += Math.abs(tx.total);
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
    overheadCosts,
    operatingCosts,
    capitalExpenditure,
    loanInterest,
    netProfit: revenue - inputCosts - overheadCosts - operatingCosts - capitalExpenditure - loanInterest,
    // Post-MVP: net worth should be read from EconomicHistory for the selected turn rather than
    // always reflecting current state. Currently net worth is always current regardless of which
    // historical turn is being viewed.
    netWorth: corporationNetWorth(state, corporationId),
    firmBooks,
    lines: allLines,
  };
}
