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
import type { AppNotification, GateAction } from "./notificationTypes";

export type Screen = "map" | "tenders" | "books" | "finance" | "products";

let _notifCounter = 0;
function notifId() { return `notif-${++_notifCounter}-${Date.now()}`; }
function gateId()  { return `gate-${++_notifCounter}-${Date.now()}`; }

interface GameStore {
  gameState: GameState | null;
  selectedNodeId: string | null;
  selectedFirmId: string | null;
  activeScreen: Screen;
  lastTickResult: TickResult | null;
  lastBooks: CorporateBooks | null;

  // Notification system
  notifications: AppNotification[];
  notificationPanelOpen: boolean;

  // End Turn gate
  gateQueue: GateAction[];

  // Actions — game lifecycle
  startNewGame: (playerName: string) => void;
  endTurn: () => void;

  // Actions — selection / navigation
  selectNode: (nodeId: string | null) => void;
  selectFirm: (firmId: string | null) => void;
  setScreen: (screen: Screen) => void;

  // Actions — firm management
  buildInvestment: (firmId: string, type: InvestmentType) => string | null;
  buildFirm: (cityNodeId: string, type: "farm" | "factory" | "store", name: string) => string | null;
  setRetailPrice: (firmId: string, product: ProductId, price: number) => void;
  setSellToCompetitors: (firmId: string, enabled: boolean) => void;

  // Actions — finance
  requestLoan: (principal: number, durationTurns: number) => string | null;
  addContract: (contract: Omit<Contract, "id" | "turnsExecuted">) => string | null;
  bidOnTender: (tenderId: string, firmId: string, volume: number, price: number) => string | null;
  setTrainingBudget: (amount: number) => void;
  setMarketingBudget: (amount: number) => void;

  // Actions — notifications
  dismissNotification: (id: string) => void;
  toggleNotificationPanel: () => void;

  // Actions — gate
  resolveGateAction: (gateId: string, optionLabel: string) => void;

  // Actions — win
  endGame: () => void;
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
  notifications: [],
  notificationPanelOpen: false,
  gateQueue: [],

  // ------------------------------------------------------------------
  // Game lifecycle
  // ------------------------------------------------------------------

  startNewGame: (playerName) => {
    const state = newGame(playerName);
    const playerCorpId = Object.values(state.corporations).find((c) => c.isPlayer)!.id;
    set({
      gameState: state,
      selectedNodeId: null,
      selectedFirmId: null,
      lastTickResult: null,
      lastBooks: computeCorporateBooks(state, playerCorpId, 0),
      notifications: [],
      gateQueue: [],
      notificationPanelOpen: false,
    });
  },

  endTurn: () => {
    const { gameState, gateQueue } = get();
    if (!gameState) return;
    // Losses end immediately — no gate, no action
    if (gameState.phase === "lost") return;

    // Gate check: if any actions are pending, surface the first and stop
    if (gateQueue.length > 0) {
      // The gate UI reads gateQueue[0] — just re-set to trigger render
      set({ gateQueue: [...gateQueue] });
      return;
    }

    const result = tick(gameState);
    const playerCorpId = Object.values(gameState.corporations).find((c) => c.isPlayer)!.id;
    const books = computeCorporateBooks(gameState, playerCorpId, gameState.turn - 1);

    // Build notifications from fired macro events
    const newNotifs: AppNotification[] = result.firedEvents.map((ev) => ({
      id: notifId(),
      turn: ev.turn,
      message: ev.description,
      dismissed: false,
      persistent: false,
    }));

    // Win transition: phase just became "won"
    let newGateActions: GateAction[] = [...get().gateQueue];
    if (result.justWon) {
      // Persistent win notification in the list
      const winNotifId = "win-notification"; // stable ID so it's not duplicated
      const winNotif: AppNotification = {
        id: winNotifId,
        turn: gameState.turn,
        message: "🏆 You have won the game.",
        actions: [{ label: "End Game", handler: () => get().endGame(), style: "primary" }],
        dismissed: false,
        persistent: true,
      };
      // Only add if not already present
      const existing = get().notifications.find((n) => n.id === winNotifId);
      if (!existing) newNotifs.push(winNotif);

      // One-time gate action for the win
      const winGateId = gateId();
      newGateActions = [
        ...newGateActions,
        {
          id: winGateId,
          message: "You have won the game. Would you like to keep playing or end the game?",
          options: [
            {
              label: "Keep Playing",
              handler: () => get().resolveGateAction(winGateId, "Keep Playing"),
              style: "default" as const,
            },
            {
              label: "End Game",
              handler: () => { get().resolveGateAction(winGateId, "End Game"); get().endGame(); },
              style: "primary" as const,
            },
          ],
        },
      ];
    }

    set((s) => ({
      gameState: { ...gameState },
      lastTickResult: result,
      lastBooks: books,
      notifications: [...s.notifications, ...newNotifs],
      gateQueue: newGateActions,
    }));
  },

  // ------------------------------------------------------------------
  // Selection / navigation
  // ------------------------------------------------------------------

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedFirmId: null }),
  selectFirm: (firmId) => set({ selectedFirmId: firmId }),
  setScreen: (screen) => set({ activeScreen: screen }),

  // ------------------------------------------------------------------
  // Firm management
  // ------------------------------------------------------------------

  buildInvestment: (firmId, type) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = startInvestment(gameState, firmId, type);
    if (!err) set({ gameState: { ...gameState } });
    return err;
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
    if (playerCorp.cash < cost) return `Insufficient funds. Required: €${cost.toLocaleString()}.`;
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
    if (firm) { firm.retailPrices[product] = price; set({ gameState: { ...gameState } }); }
  },

  setSellToCompetitors: (firmId, enabled) => {
    const { gameState } = get();
    if (!gameState) return;
    const firm = gameState.firms[firmId];
    if (firm) { firm.sellToCompetitors = enabled; set({ gameState: { ...gameState } }); }
  },

  // ------------------------------------------------------------------
  // Finance
  // ------------------------------------------------------------------

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
      const newId = Object.keys(gameState.contracts)[countBefore];
      if (newId) {
        const buyerFirmId = contract.buyerParty.firmId;
        const sellerFirmId = contract.sellerParty.firmId;
        if (buyerFirmId && gameState.firms[buyerFirmId]) {
          const f = gameState.firms[buyerFirmId];
          if (!f.activeContractIds.includes(newId)) f.activeContractIds.push(newId);
        }
        if (sellerFirmId && gameState.firms[sellerFirmId]) {
          const f = gameState.firms[sellerFirmId];
          if (!f.activeContractIds.includes(newId)) f.activeContractIds.push(newId);
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
    if (corp) { corp.trainingBudgetPerTurn = amount; set({ gameState: { ...gameState } }); }
  },

  setMarketingBudget: (amount) => {
    const { gameState } = get();
    if (!gameState) return;
    const corp = Object.values(gameState.corporations).find((c) => c.isPlayer);
    if (corp) { corp.marketingBudgetPerTurn = amount; set({ gameState: { ...gameState } }); }
  },

  // ------------------------------------------------------------------
  // Notifications
  // ------------------------------------------------------------------

  dismissNotification: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id && !n.persistent ? { ...n, dismissed: true } : n
      ),
    }));
  },

  toggleNotificationPanel: () => {
    set((s) => ({ notificationPanelOpen: !s.notificationPanelOpen }));
  },

  // ------------------------------------------------------------------
  // Gate
  // ------------------------------------------------------------------

  resolveGateAction: (id, _optionLabel) => {
    set((s) => ({ gateQueue: s.gateQueue.filter((g) => g.id !== id) }));
  },

  // ------------------------------------------------------------------
  // Win
  // ------------------------------------------------------------------

  endGame: () => {
    // Navigate to start screen by resetting game state
    set({ gameState: null, notifications: [], gateQueue: [] });
  },
}));

// Selector helpers
export const selectPlayerCorp = (s: GameStore) =>
  s.gameState ? Object.values(s.gameState.corporations).find((c) => c.isPlayer) ?? null : null;

export const selectTurnLabel = (s: GameStore) => {
  if (!s.gameState) return "";
  const year = 1980 + Math.floor(s.gameState.turn / 4);
  const quarter = (s.gameState.turn % 4) + 1;
  return `${year} Q${quarter}`;
};

export const selectUndismissedCount = (s: GameStore) =>
  s.notifications.filter((n) => !n.dismissed).length;
