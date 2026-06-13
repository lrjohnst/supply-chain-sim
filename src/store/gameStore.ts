import { create } from "zustand";
import type { GameState, CorporateBooks, ProductId } from "../types";
import { newGame, makeFirm } from "../engine/newGame";
import { tick, type TickResult } from "../engine/tick";
import { computeCorporateBooks } from "../engine/books";
import {
  startInvestment,
  cancelInvestment as engineCancelInvestment,
  configureProductionLine as engineConfigureLine,
  markLineIntentionallyIdle as engineMarkLineIdle,
  cancelPendingRecipeChange as engineCancelPending,
  markSectionIntentionallyIdle as engineMarkSectionIdle,
} from "../engine/investments";
import { takeLoan, computeTotalAssets } from "../engine/loans";
import { createContract, executeBreachDeclaration, resetBreachCounters } from "../engine/contracts";
import { generateId } from "../engine/utils";
import { submitTenderBid, withdrawTenderBid as engineWithdrawTenderBid } from "../engine/tenders";
import type { InvestmentType, Contract, RecipeKey, ProductId } from "../types";
import type { AppNotification, GateAction } from "./notificationTypes";
import { GameConfig } from "../config/gameConfig";

export type Screen = "map" | "tenders" | "contracts" | "books" | "finance" | "products" | "settings";

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
  cancelInvestment: (firmId: string, investmentId: string) => string | null;
  configureProductionLine: (firmId: string, investmentId: string, recipe: RecipeKey) => string | null;
  cancelPendingRecipeChange: (firmId: string, investmentId: string) => string | null;
  markLineIntentionallyIdle: (firmId: string, investmentId: string) => string | null;
  markSectionIntentionallyIdle: (firmId: string, investmentId: string) => string | null;
  toggleHarborAutoSource: (firmId: string, productId: ProductId, enabled: boolean) => void;
  buildFirm: (cityNodeId: string, type: "farm" | "factory" | "store", name: string) => string | null;
  setRetailPrice: (firmId: string, product: ProductId, price: number) => void;
  setSellToCompetitors: (firmId: string, enabled: boolean) => void;

  // Actions — finance
  requestLoan: (principal: number, durationTurns: number) => string | null;
  addContract: (contract: Omit<Contract, "id" | "turnsExecuted" | "cumulativeVolumeShortfall" | "consecutiveQualityFailureTurns">) => string | null;
  bidOnTender: (tenderId: string, firmId: string, volume: number, price: number) => string | null;
  withdrawTenderBid: (tenderId: string, corporationId: string) => string | null;
  setCorporateTrainingIntensity: (intensity: number) => void;
  setFirmTrainingIntensity: (firmId: string, intensity: number) => void;
  resetFirmTrainingIntensity: (firmId: string) => void;
  setMarketingBudget: (amount: number) => void;

  // Actions — notifications
  dismissNotification: (id: string) => void;
  toggleNotificationPanel: () => void;

  // Actions — gate
  resolveGateAction: (gateId: string, optionLabel: string) => void;

  // Actions — win
  endGame: () => void;
  dismissWinScreen: () => void;

  // Win screen visibility
  showWinScreen: boolean;
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
  showWinScreen: false,

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
      showWinScreen: false,
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

    // Construction pause notifications
    for (const p of result.pausedInvestments) {
      newNotifs.push({
        id: notifId(),
        turn: gameState.turn - 1,
        message: `Construction paused at ${p.firmName}: insufficient funds for ${p.investmentType.replace(/_/g, " ")}. Payment will resume next turn if funds are available.`,
        dismissed: false,
        persistent: false,
      });
    }

    // Win transition: phase just became "won"
    const newGateActions: GateAction[] = [...get().gateQueue];
    if (result.justWon) {
      set({ showWinScreen: true });
    }

    // ----------------------------------------------------------------
    // Unconfigured investment gates
    // Each fires once per unconfigured investment per turn until
    // configured or marked intentionally idle. Stable gate IDs prevent
    // duplicate entries across turns.
    // ----------------------------------------------------------------

    // Store sections with defined products that can be configured.
    // Other sections (cosmetics, hardware, clothing, pharmacy) have no MVP
    // products yet and are excluded — their gate is deferred.
    const STORE_SECTION_PRODUCTS: Partial<Record<string, string[]>> = {
      grocery_section:     ["chicken", "chicken_soup", "ice_cream_strawberry"],
      electronics_section: ["laptop_branded", "printer_branded"],
    };

    const isSectionConfigured = (firm: import("../types").Firm, invType: string): boolean => {
      const products = STORE_SECTION_PRODUCTS[invType] ?? [];
      if (products.length === 0) return true; // no products to configure
      return products.some((p) =>
        firm.harborAutoSource[p as import("../types").ProductId] === true ||
        firm.retailPrices[p as import("../types").ProductId] !== undefined
      );
    };

    const playerCorp2 = Object.values(gameState.corporations).find((c) => c.isPlayer);
    if (playerCorp2) {
      for (const firmId of playerCorp2.firmIds) {
        const firm = gameState.firms[firmId];
        for (const inv of firm.investments) {
          if (inv.status !== "complete" || inv.type !== "production_line") continue;
          const line = firm.productionLines.find((l) => l.investmentId === inv.id);
          if (!line || line.lineStatus !== "unconfigured" || line.intentionallyIdle) continue;

          const stableGateId = `gate-unconfigured-${inv.id}`;
          if (newGateActions.some((g) => g.id === stableGateId)) continue; // already queued

          const capturedFirmId = firmId;
          const capturedInvId  = inv.id;
          const capturedFirmName = firm.name;

          newGateActions.push({
            id: stableGateId,
            message: `Your ${capturedFirmName} has an unconfigured Production line. Would you like to configure it now or leave it idle?`,
            options: [
              {
                label: "Configure Now",
                handler: () => {
                  get().selectFirm(capturedFirmId);
                  get().resolveGateAction(stableGateId, "Configure Now");
                },
                style: "primary" as const,
              },
              {
                label: "Leave Idle",
                handler: () => get().resolveGateAction(stableGateId, "Leave Idle"),
                style: "default" as const,
              },
              {
                label: "Mark as Intentionally Idle",
                handler: () => {
                  const { gameState: gs } = get();
                  if (gs) { engineMarkLineIdle(gs, capturedFirmId, capturedInvId); set({ gameState: { ...gs } }); }
                  get().resolveGateAction(stableGateId, "Mark as Intentionally Idle");
                },
                style: "default" as const,
              },
            ],
          });
        }

        // Store section gates
        if (firm.type === "store") {
          for (const inv of firm.investments) {
            if (inv.status !== "complete") continue;
            if (!STORE_SECTION_PRODUCTS[inv.type]) continue; // section not gated
            if (inv.intentionallyIdle) continue;
            if (isSectionConfigured(firm, inv.type)) continue;

            const sectionGateId = `gate-section-${inv.id}`;
            if (newGateActions.some((g) => g.id === sectionGateId)) continue;

            const cFirmId   = firmId;
            const cInvId    = inv.id;
            const cFirmName = firm.name;
            const sectionLabel = inv.type.replace(/_/g, " ");

            newGateActions.push({
              id: sectionGateId,
              message: `Your ${cFirmName} has an unconfigured ${sectionLabel}. Would you like to set up sourcing and pricing now or leave it idle?`,
              options: [
                {
                  label: "Configure Now",
                  handler: () => {
                    get().selectFirm(cFirmId);
                    get().resolveGateAction(sectionGateId, "Configure Now");
                  },
                  style: "primary" as const,
                },
                {
                  label: "Leave Idle",
                  handler: () => get().resolveGateAction(sectionGateId, "Leave Idle"),
                  style: "default" as const,
                },
                {
                  label: "Mark as Intentionally Idle",
                  handler: () => {
                    const { gameState: gs } = get();
                    if (gs) { engineMarkSectionIdle(gs, cFirmId, cInvId); set({ gameState: { ...gs } }); }
                    get().resolveGateAction(sectionGateId, "Mark as Intentionally Idle");
                  },
                  style: "default" as const,
                },
              ],
            });
          }
        }
      }
    }

    // ----------------------------------------------------------------
    // Breach gate proposals — convert engine proposals to gate actions
    // ----------------------------------------------------------------
    for (const proposal of result.breachGateProposals) {
      const stableGateId = `gate-breach-${proposal.contractId}`;
      if (newGateActions.some((g) => g.id === stableGateId)) continue;

      const { contractId, reason, counterpartyName, sellerCorpId } = proposal;
      const reasonLabel = reason === "volume_shortfall"
        ? `cumulative delivery shortfall exceeded ${GameConfig.contracts.volumeShortfallBreachThreshold} units`
        : `quality fell below threshold for ${GameConfig.contracts.qualityBreachConsecutiveTurns} consecutive turns`;

      newGateActions.push({
        id: stableGateId,
        message: `Contract breach conditions met: ${reasonLabel}. ${counterpartyName} has failed to meet ${reason === "volume_shortfall" ? "volume" : "quality"} requirements. Declare breach and terminate contract?`,
        options: [
          {
            label: "Declare Breach",
            handler: () => {
              const { gameState: gs } = get();
              if (!gs) return;
              const msgs = executeBreachDeclaration(gs, contractId);
              set((s) => ({
                gameState: { ...gs },
                notifications: [
                  ...s.notifications,
                  ...msgs.map((m) => ({
                    id: notifId(), turn: gs.turn, message: m,
                    dismissed: false, persistent: false,
                  })),
                ],
              }));
              get().resolveGateAction(stableGateId, "Declare Breach");
            },
            style: "primary" as const,
          },
          {
            label: "Continue Contract",
            handler: () => {
              const { gameState: gs } = get();
              if (gs) {
                resetBreachCounters(gs, contractId);
                set({ gameState: { ...gs } });
              }
              get().resolveGateAction(stableGateId, "Continue Contract");
            },
            style: "default" as const,
          },
        ],
      });

      // Suppress unused-variable warning — sellerCorpId captured for future use (e.g. fine notifications)
      void sellerCorpId;
    }

    // Breach risk warnings — replace old set with fresh one each tick.
    // Stable IDs mean auto-dismiss when risk resolves, no duplicates while it persists.
    const warningIds = new Set(result.contractWarnings.map((w) => w.id));
    const breachNotifs: AppNotification[] = result.contractWarnings.map((w) => ({
      id: w.id,
      turn: gameState.turn - 1,
      message: w.message,
      dismissed: false,
      persistent: false,
    }));

    set((s) => ({
      gameState: { ...gameState },
      lastTickResult: result,
      lastBooks: books,
      notifications: [
        // Keep non-breach, non-bankruptcy-warning notifications
        ...s.notifications.filter(
          (n) =>
            !n.id.startsWith("breach-") &&
            !n.message.startsWith("⚠ At your current burn rate")
        ),
        // Re-add breach warnings that are still active (preserves dismissed state)
        ...s.notifications
          .filter((n) => n.id.startsWith("breach-") && warningIds.has(n.id))
          .map((n) => {
            const fresh = result.contractWarnings.find((w) => w.id === n.id);
            return fresh ? { ...n, message: fresh.message, dismissed: false } : n;
          }),
        // Add new breach warnings not previously seen
        ...breachNotifs.filter(
          (w) => !s.notifications.some((n) => n.id === w.id)
        ),
        ...newNotifs,
      ],
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

  cancelInvestment: (firmId, investmentId) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = engineCancelInvestment(gameState, firmId, investmentId);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  configureProductionLine: (firmId, investmentId, recipe) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = engineConfigureLine(gameState, firmId, investmentId, recipe);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  cancelPendingRecipeChange: (firmId, investmentId) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = engineCancelPending(gameState, firmId, investmentId);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  markLineIntentionallyIdle: (firmId, investmentId) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = engineMarkLineIdle(gameState, firmId, investmentId);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  markSectionIntentionallyIdle: (firmId, investmentId) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = engineMarkSectionIdle(gameState, firmId, investmentId);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  toggleHarborAutoSource: (firmId, productId, enabled) => {
    const { gameState } = get();
    if (!gameState) return;
    const firm = gameState.firms[firmId];
    if (!firm) return;
    firm.harborAutoSource[productId] = enabled;
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
    if (playerCorp.cash < cost) return `Insufficient funds. Required: €${cost.toLocaleString()}.`;
    const id = generateId();
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
    const { error } = createContract(gameState, {
      ...contract,
      originId: null,
      originType: null,
      incumbentNoticeGiven: false,
      lastBreachWarnTurn: 0,
    });
    if (!error) set({ gameState: { ...gameState } });
    return error;
  },

  bidOnTender: (tenderId, firmId, volume, price) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = submitTenderBid(gameState, tenderId, firmId, volume, price);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  withdrawTenderBid: (tenderId, corporationId) => {
    const { gameState } = get();
    if (!gameState) return "No active game.";
    const err = engineWithdrawTenderBid(gameState, tenderId, corporationId);
    if (!err) set({ gameState: { ...gameState } });
    return err;
  },

  setCorporateTrainingIntensity: (intensity) => {
    const { gameState } = get();
    if (!gameState) return;
    const corp = Object.values(gameState.corporations).find((c) => c.isPlayer);
    if (!corp) return;
    corp.corporateTrainingIntensity = intensity;
    // Update all non-overridden firms to match the new corporate default.
    for (const firmId of corp.firmIds) {
      const firm = gameState.firms[firmId];
      if (firm && !firm.trainingIntensityOverridden) {
        firm.trainingIntensity = intensity;
      }
    }
    set({ gameState: { ...gameState } });
  },

  setFirmTrainingIntensity: (firmId, intensity) => {
    const { gameState } = get();
    if (!gameState) return;
    const firm = gameState.firms[firmId];
    if (!firm) return;
    firm.trainingIntensity = intensity;
    firm.trainingIntensityOverridden = true;
    set({ gameState: { ...gameState } });
  },

  resetFirmTrainingIntensity: (firmId) => {
    const { gameState } = get();
    if (!gameState) return;
    const firm = gameState.firms[firmId];
    if (!firm) return;
    const corp = gameState.corporations[firm.corporationId];
    if (!corp) return;
    firm.trainingIntensity = corp.corporateTrainingIntensity;
    firm.trainingIntensityOverridden = false;
    set({ gameState: { ...gameState } });
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
    set({ gameState: null, notifications: [], gateQueue: [], showWinScreen: false });
  },

  dismissWinScreen: () => {
    set({ showWinScreen: false });
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
