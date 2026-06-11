import { create } from "zustand";
import type { GameState, CorporateBooks, ProductId } from "../types";
import { newGame, makeFirm } from "../engine/newGame";
import { tick, type TickResult } from "../engine/tick";
import { computeCorporateBooks } from "../engine/books";
import { startInvestment } from "../engine/investments";
import { takeLoan } from "../engine/loans";
import { createContract } from "../engine/contracts";
import { submitTenderBid } from "../engine/tenders";
import type { InvestmentType, Contract } from "../types";

export type Screen = "map" | "tenders" | "books" | "finance" | "products";

interface GameStore {
  gameState: GameState | null;
  selectedNodeId: string | null;
  selectedFirmId: string | null;
  activeScreen: Screen;
  lastTickResult: TickResult | null;
  lastBooks: CorporateBooks | null;

  // Actions
  startNewGame: (playerName: string) => void;
  endTurn: () => void;
  selectNode: (nodeId: string | null) => void;
  selectFirm: (firmId: string | null) => void;
  setScreen: (screen: Screen) => void;
  buildInvestment: (firmId: string, type: InvestmentType) => string | null;
  requestLoan: (principal: number, durationTurns: number) => string | null;
  addContract: (contract: Omit<Contract, "id" | "turnsExecuted">) => string | null;
  bidOnTender: (tenderId: string, firmId: string, volume: number, price: number) => string | null;
  setTrainingBudget: (amount: number) => void;
  setMarketingBudget: (amount: number) => void;
  buildFirm: (cityNodeId: string, type: "farm" | "factory" | "store", name: string) => string | null;
  setRetailPrice: (firmId: string, product: ProductId, price: number) => void;
  setSellToCompetitors: (firmId: string, enabled: boolean) => void;
  confirmEndGame: () => void;
  keepPlaying: () => void;
}

const FIRM_BUILD_COST: Record<"farm" | "factory" | "store", number> = {
  farm: 15_000,
  factory: 25_000,
  store: 10_000,
};

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  selectedNodeId: null,
  selectedFirmId: null,
  activeScreen: "map",
  lastTickResult: null,
  lastBooks: null,

  startNewGame: (playerName) => {
    const state = newGame(playerName);
    const playerCorpId = Object.values(state.corporations).find((c) => c.isPlayer)!.id;
    set({
      gameState: state,
      selectedNodeId: null,
      selectedFirmId: null,
      lastTickResult: null,
      lastBooks: computeCorporateBooks(state, playerCorpId, 0),
    });
  },

  endTurn: () => {
    const { gameState } = get();
    if (!gameState || gameState.phase !== "playing") return;

    const result = tick(gameState);
    const playerCorpId = Object.values(gameState.corporations).find((c) => c.isPlayer)!.id;
    const books = computeCorporateBooks(gameState, playerCorpId, gameState.turn - 1);

    set({ gameState: { ...gameState }, lastTickResult: result, lastBooks: books });
  },

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedFirmId: null }),
  selectFirm: (firmId) => set({ selectedFirmId: firmId }),
  setScreen: (screen) => set({ activeScreen: screen }),

  buildInvestment: (firmId, type) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = startInvestment(gameState, firmId, type);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  requestLoan: (principal, durationTurns) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const playerCorpId = Object.values(gameState.corporations).find((c) => c.isPlayer)!.id;
    const err = takeLoan(gameState, playerCorpId, principal, durationTurns);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  addContract: (contract) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const countBefore = Object.keys(gameState.contracts).length;
    const err = createContract(gameState, contract);
    if (!err) {
      // Register the new contract on both firms (if they exist)
      const newId = Object.keys(gameState.contracts)[countBefore];
      if (newId) {
        const buyerFirmId = contract.buyerParty.firmId;
        const sellerFirmId = contract.sellerParty.firmId;
        if (buyerFirmId && gameState.firms[buyerFirmId]) {
          const firm = gameState.firms[buyerFirmId];
          if (!firm.activeContractIds.includes(newId)) firm.activeContractIds.push(newId);
        }
        if (sellerFirmId && gameState.firms[sellerFirmId]) {
          const firm = gameState.firms[sellerFirmId];
          if (!firm.activeContractIds.includes(newId)) firm.activeContractIds.push(newId);
        }
      }
      set({ gameState: { ...gameState } });
    }
    return err;
  },

  bidOnTender: (tenderId, firmId, volume, price) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = submitTenderBid(gameState, tenderId, firmId, volume, price);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  setTrainingBudget: (amount) => {
    const { gameState } = get();
    if (!gameState) return;
    const corp = Object.values(gameState.corporations).find((c) => c.isPlayer);
    if (!corp) return;
    corp.trainingBudgetPerTurn = amount;
    set({ gameState: { ...gameState } });
  },

  setMarketingBudget: (amount) => {
    const { gameState } = get();
    if (!gameState) return;
    const corp = Object.values(gameState.corporations).find((c) => c.isPlayer);
    if (!corp) return;
    corp.marketingBudgetPerTurn = amount;
    set({ gameState: { ...gameState } });
  },

  buildFirm: (cityNodeId, type, name) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";

    const playerCorp = Object.values(gameState.corporations).find((c) => c.isPlayer);
    if (!playerCorp) return "No player corporation.";

    const city = gameState.cityNodes[cityNodeId];
    if (!city) return "City not found.";
    if (city.firmSlots === 0) return "Cannot build firms at this location.";

    const firmsInCity = Object.values(gameState.firms).filter(
      (f) => f.cityNodeId === cityNodeId && f.corporationId === playerCorp.id
    ).length;
    if (firmsInCity >= city.firmSlots) return "No firm slots remaining in this city.";

    const cost = FIRM_BUILD_COST[type];
    if (playerCorp.cash < cost) {
      return `Insufficient funds. Required: €${cost.toLocaleString()}.`;
    }

    const id = Math.random().toString(36).slice(2, 10);
    gameState.firms[id] = makeFirm(id, playerCorp.id, cityNodeId, type, name);
    playerCorp.firmIds.push(id);
    playerCorp.cash -= cost;

    set({ gameState: { ...gameState } });
    return null;
  },

  setRetailPrice: (firmId, product, price) => {
    const { gameState } = get();
    if (!gameState) return;
    const firm = gameState.firms[firmId];
    if (!firm) return;
    firm.retailPrices[product] = price;
    set({ gameState: { ...gameState } });
  },

  setSellToCompetitors: (firmId, enabled) => {
    const { gameState } = get();
    if (!gameState) return;
    const firm = gameState.firms[firmId];
    if (!firm) return;
    firm.sellToCompetitors = enabled;
    set({ gameState: { ...gameState } });
  },

  confirmEndGame: () => {
    const { gameState } = get();
    if (!gameState?.pendingWin) return;
    gameState.phase = "won";
    gameState.pendingWin = null;
    set({ gameState: { ...gameState } });
  },

  keepPlaying: () => {
    const { gameState } = get();
    if (!gameState?.pendingWin) return;
    // Suppress future notifications — win threshold already crossed
    gameState.pendingWin = { ...gameState.pendingWin, suppressFuture: true };
    set({ gameState: { ...gameState } });
  },
}));

// Selector helpers
export const selectPlayerCorp = (s: GameStore) =>
  s.gameState
    ? Object.values(s.gameState.corporations).find((c) => c.isPlayer) ?? null
    : null;

export const selectTurnLabel = (s: GameStore) => {
  if (!s.gameState) return "";
  const year = 1980 + Math.floor(s.gameState.turn / 4);
  const quarter = (s.gameState.turn % 4) + 1;
  return `${year} Q${quarter}`;
};
