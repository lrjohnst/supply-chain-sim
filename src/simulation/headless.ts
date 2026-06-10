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

function playerSetup(state: GameState, playerCorpId: string) {
  // Build a store in Aldenmoor (city_a — largest city)
  const storeId = buildFirm(state, playerCorpId, "city_a", "store", "Aldenmoor Store");
  if (!storeId) return;

  // Invest in grocery section
  startInvestment(state, storeId, "grocery_section");

  // Set up harbor supply contract for ice cream (demand ~2400/turn in 800k city)
  // Start it immediately — grocery section will complete in 2 turns
  createHarborContract(state, playerCorpId, storeId, "ice_cream_strawberry", 400, 40);
}

function playerTurn(_state: GameState, _playerCorpId: string) {
  // Conservative player does nothing after setup
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

    if (result.gameOver) {
      console.log(`\n*** GAME OVER at ${turnLabel(t)} — Winner: ${result.winner === playerCorpId ? "PLAYER" : "AI"} ***\n`);
      break;
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
