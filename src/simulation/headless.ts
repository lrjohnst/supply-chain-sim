/**
 * Headless simulation — runs a full game and reports what happens.
 * Run with: npx tsx src/simulation/headless.ts
 */

import { newGame, makeFirm } from "../engine/newGame";
import { tick } from "../engine/tick";
import { computeCorporateBooks } from "../engine/books";
import { corporationNetWorth } from "../engine/utils";
import { startInvestment } from "../engine/investments";
import { takeLoan } from "../engine/loans";
import { createContract } from "../engine/contracts";
import type { GameState, ProductId } from "../types";
import { GameConfig } from "../config/gameConfig";

// ------------------------------------------------------------------
// Player strategy: conservative ice cream retail
// ------------------------------------------------------------------

// ID of the player's store — set in setup, used in playerTurn for contract renewal
let playerStoreId: string | null = null;

function playerSetup(state: GameState, playerCorpId: string) {
  // Build a store in Aldenmoor (city_a — largest city)
  playerStoreId = buildFirm(state, playerCorpId, "city_a", "store", "Aldenmoor Store");
  if (!playerStoreId) return;

  // Invest in grocery section
  startInvestment(state, playerStoreId, "grocery_section");
  // Note: do NOT create a harbor contract here — multi-year contracts are locked
  // at game start. playerTurn will create short-term contracts each turn.
}

function playerTurn(state: GameState, playerCorpId: string) {
  if (!playerStoreId) return;
  const corp = state.corporations[playerCorpId];

  // Renew ice cream supply contract if none is active for this store
  const activeIceCream = Object.values(state.contracts).some(
    (c) =>
      c.status === "active" &&
      c.product === "ice_cream_strawberry" &&
      c.buyerParty.firmId === playerStoreId &&
      state.turn < c.startTurn + c.durationTurns
  );

  if (!activeIceCream) {
    // Short-term contract (2 turns) — always available
    createHarborContract(state, playerCorpId, playerStoreId, "ice_cream_strawberry", 400, 2);
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function buildFirm(
  state: GameState,
  corpId: string,
  cityNodeId: string,
  type: "farm" | "factory" | "store",
  name: string
): string | null {
  const COSTS = { farm: 15_000, factory: 25_000, store: 10_000 };
  const corp = state.corporations[corpId];
  const city = state.cityNodes[cityNodeId];
  if (!city || city.firmSlots === 0) return null;
  const firmsInCity = Object.values(state.firms).filter(
    (f) => f.cityNodeId === cityNodeId && f.corporationId === corpId
  ).length;
  if (firmsInCity >= city.firmSlots) return null;
  if (corp.cash < COSTS[type]) return null;

  const id = Math.random().toString(36).slice(2, 10);
  state.firms[id] = makeFirm(id, corpId, cityNodeId, type, name);
  corp.firmIds.push(id);
  corp.cash -= COSTS[type];
  return id;
}

function createHarborContract(
  state: GameState,
  corpId: string,
  firmId: string,
  product: ProductId,
  volumePerTurn: number,
  durationTurns: number
) {
  const harborPrice = state.harborNode.prices[product];
  createContract(state, {
    status: "active",
    buyerParty: { type: "corporation", corporationId: corpId, firmId },
    sellerParty: { type: "harbor", corporationId: null, firmId: null },
    product,
    volumePerTurn,
    unitPrice: harborPrice,
    qualityThreshold: 0,
    deliveryTurns: 1,
    startTurn: state.turn,
    durationTurns,
    isInternal: false,
  });
  const newId = Object.keys(state.contracts).at(-1)!;
  const firm = state.firms[firmId];
  if (!firm.activeContractIds.includes(newId)) firm.activeContractIds.push(newId);
}

// ------------------------------------------------------------------
// Run simulation
// ------------------------------------------------------------------

function turnLabel(turn: number): string {
  const year = 1980 + Math.floor(turn / 4);
  const q = (turn % 4) + 1;
  return `${year} Q${q}`;
}

function fmt(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}€${Math.round(n).toLocaleString("en-GB")}`;
}

function run() {
  const state = newGame("Player Corp");
  const playerCorpId = Object.values(state.corporations).find((c) => c.isPlayer)!.id;
  const aiCorpId = Object.values(state.corporations).find((c) => !c.isPlayer)!.id;

  console.log("=".repeat(70));
  console.log("HEADLESS SIMULATION — Supply Chain Sim");
  console.log("=".repeat(70));
  console.log(`Player: ${state.corporations[playerCorpId].name}`);
  console.log(`AI:     ${state.corporations[aiCorpId].name}`);
  console.log(`Win condition: €${GameConfig.game.netWorthWinThreshold.toLocaleString()} net worth`);
  console.log();

  // Player setup on turn 0 before first tick
  playerSetup(state, playerCorpId);

  // Early diagnostics: print per-turn ledger for first 8 turns
  console.log("\n--- Early turn diagnostics (first 8 turns) ---");

  const snapshots: {
    turn: number;
    playerNW: number; playerCash: number; playerProfit: number;
    aiNW: number; aiCash: number; aiProfit: number;
    events: string[];
  }[] = [];

  for (let t = 0; t < GameConfig.game.turnsNormal; t++) {
    playerTurn(state, playerCorpId);

    const result = tick(state);

    const pBooks = computeCorporateBooks(state, playerCorpId, t);
    const aBooks = computeCorporateBooks(state, aiCorpId, t);

    if (t < 8) {
      const txSummary = pBooks.lines.filter((tx) => tx.total !== 0)
        .map((tx) => `    ${tx.category.padEnd(18)} ${tx.description.slice(0, 50).padEnd(50)} ${tx.total >= 0 ? "+" : ""}${Math.round(tx.total).toLocaleString()}`).join("\n");
      console.log(`  ${turnLabel(t)}: revenue=${Math.round(pBooks.revenue)} inputCosts=${Math.round(pBooks.inputCosts)} operating=${Math.round(pBooks.operatingCosts)} net=${Math.round(pBooks.netProfit)} cash=${Math.round(state.corporations[playerCorpId].cash)}`);
      if (txSummary) console.log(txSummary);
    }

    snapshots.push({
      turn: t,
      playerNW: corporationNetWorth(state, playerCorpId),
      playerCash: state.corporations[playerCorpId].cash,
      playerProfit: pBooks.netProfit,
      aiNW: corporationNetWorth(state, aiCorpId),
      aiCash: state.corporations[aiCorpId].cash,
      aiProfit: aBooks.netProfit,
      events: result.firedEvents.map((e) => e.description),
    });

    if (result.isLoss) {
      console.log(`\n*** BANKRUPTCY / LOSS at ${turnLabel(t)} ***`);
      if (result.bankruptcyReason) {
        console.log(`  Obligation: ${result.bankruptcyReason.obligation}`);
        console.log(`  Amount due: €${Math.round(result.bankruptcyReason.amount).toLocaleString()}`);
        console.log(`  Cash available: €${Math.round(result.bankruptcyReason.cashAvailable).toLocaleString()}`);
      }
      break;
    }
    if (result.justWon) {
      console.log(`\n*** WIN at ${turnLabel(t)} — net worth €${Math.round(corporationNetWorth(state, playerCorpId)).toLocaleString()} ***\n`);
    }
  }

  // Print turn-by-turn summary every 4 turns (yearly)
  console.log(
    "Turn        | Player Net Worth    | Player P&L    | AI Net Worth        | AI P&L        | Events"
  );
  console.log("-".repeat(120));

  for (const s of snapshots) {
    if (s.turn % 4 !== 3) continue; // yearly
    const events = s.events.length > 0 ? s.events.map((e) => e.slice(0, 40)).join("; ") : "—";
    console.log(
      `${turnLabel(s.turn).padEnd(12)}| ${fmt(s.playerNW).padEnd(20)}| ${fmt(s.playerProfit).padEnd(14)}| ${fmt(s.aiNW).padEnd(20)}| ${fmt(s.aiProfit).padEnd(14)}| ${events}`
    );
  }

  // Final state
  const finalPlayer = snapshots.at(-1)!;
  const finalAI = snapshots.at(-1)!;

  console.log("\n" + "=".repeat(70));
  console.log("FINAL STATE");
  console.log("=".repeat(70));
  console.log(`Player net worth: €${Math.round(finalPlayer.playerNW).toLocaleString()}`);
  console.log(`Player cash:      €${Math.round(finalPlayer.playerCash).toLocaleString()}`);
  console.log(`AI net worth:     €${Math.round(finalAI.aiNW).toLocaleString()}`);
  console.log(`AI cash:          €${Math.round(finalAI.aiCash).toLocaleString()}`);

  // Firm summary
  console.log("\n--- Player firms ---");
  const pCorp = state.corporations[playerCorpId];
  for (const fid of pCorp.firmIds) {
    const f = state.firms[fid];
    const city = state.cityNodes[f.cityNodeId];
    const invDone = f.investments.filter((i) => i.status === "complete").map((i) => i.type).join(", ");
    console.log(`  [${f.type}] ${f.name} @ ${city?.name} | investments: ${invDone || "none"}`);
  }

  console.log("\n--- AI firms ---");
  const aCorp = state.corporations[aiCorpId];
  for (const fid of aCorp.firmIds) {
    const f = state.firms[fid];
    const city = state.cityNodes[f.cityNodeId];
    const invDone = f.investments.filter((i) => i.status === "complete").map((i) => i.type).join(", ");
    console.log(`  [${f.type}] ${f.name} @ ${city?.name} | investments: ${invDone || "none"}`);
  }

  // Worst turns for player
  const worstTurns = [...snapshots].sort((a, b) => a.playerProfit - b.playerProfit).slice(0, 5);
  console.log("\n--- Player's 5 worst turns (P&L) ---");
  for (const s of worstTurns) {
    console.log(`  ${turnLabel(s.turn)}: ${fmt(s.playerProfit)}`);
  }

  // Event log
  const allEvents = snapshots.flatMap((s) => s.events.map((e) => `  ${turnLabel(s.turn)}: ${e}`));
  if (allEvents.length > 0) {
    console.log("\n--- Macro events ---");
    allEvents.forEach((e) => console.log(e));
  }
}

run();
