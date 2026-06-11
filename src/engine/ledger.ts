import type { GameState, Transaction, TransactionCategory, ProductId } from "../types";
import { generateId } from "./utils";
import { displayName } from "./products";

interface PostArgs {
  state: GameState;
  turn: number;
  firmId: string | null;
  corporationId: string;
  category: TransactionCategory;
  counterparty: string;
  product: ProductId | null;
  quantity: number | null;
  unitPrice: number | null;
  total: number;
}

/** Appends a transaction to the ledger and adjusts corporation cash. */
export function postTransaction(args: PostArgs): Transaction {
  const tx: Transaction = {
    id: generateId(),
    turn: args.turn,
    firmId: args.firmId,
    corporationId: args.corporationId,
    category: args.category,
    counterparty: args.counterparty,
    product: args.product,
    quantity: args.quantity,
    unitPrice: args.unitPrice,
    total: args.total,
    description: buildDescription(args),
  };

  args.state.transactions.push(tx);
  args.state.corporations[args.corporationId].cash += args.total;

  return tx;
}

function buildDescription(args: PostArgs): string {
  if (args.product && args.quantity !== null && args.unitPrice !== null) {
    return `${displayName(args.product)} — ${args.counterparty} — ${args.quantity}u × €${args.unitPrice.toFixed(2)}/u`;
  }
  if (args.product) {
    return `${displayName(args.product)} — ${args.counterparty}`;
  }
  return `${args.category.replace(/_/g, " ")} — ${args.counterparty}`;
}

/** Returns all transactions for a given firm and turn. */
export function firmTurnTransactions(
  state: GameState,
  firmId: string,
  turn: number
): Transaction[] {
  return state.transactions.filter((t) => t.firmId === firmId && t.turn === turn);
}

/** Returns all transactions for a corporation (all firms + corporate-level) for a given turn. */
export function corporationTurnTransactions(
  state: GameState,
  corporationId: string,
  turn: number
): Transaction[] {
  return state.transactions.filter((t) => t.corporationId === corporationId && t.turn === turn);
}
