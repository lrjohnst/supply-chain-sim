import type { GameState, HarborNode, Corporation, Firm } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";
import { getBasePrice, getHarborSoldProducts } from "./harbor";
import { buildCityNodes, buildMapLinks } from "./map";

/** Create a fresh game state. */
export function newGame(playerName: string): GameState {
  const harborNode: HarborNode = {
    id: "harbor",
    name: "International Harbor",
    position: { x: 900, y: 400 },
    // Prices start at base values; tickHarborPrices overwrites them on turn 0.
    prices: Object.fromEntries(
      getHarborSoldProducts().map((p) => [p, getBasePrice(p)])
    ) as HarborNode["prices"],
  };

  const cityNodes = buildCityNodes();
  const mapLinks = buildMapLinks(cityNodes);

  const playerCorpId = generateId();
  const aiCorpId = generateId();

  const playerCorp: Corporation = {
    id: playerCorpId,
    name: playerName,
    isPlayer: true,
    cash: GameConfig.player.startingCash,
    firmIds: [],
    loanIds: [],
    cumulativeRevenue: 0,
    corporateTrainingIntensity: GameConfig.training.defaultCorporateIntensity,
    marketingBudgetPerTurn: 0,
    multiYearContractsUnlocked: false,
    eliminated: false,
  };

  const aiCorp: Corporation = {
    id: aiCorpId,
    name: GameConfig.ai.startingCorporationName,
    isPlayer: false,
    cash: GameConfig.ai.startingCash,
    firmIds: [],
    loanIds: [],
    cumulativeRevenue: 0,
    corporateTrainingIntensity: GameConfig.training.defaultCorporateIntensity,
    marketingBudgetPerTurn: 0,
    multiYearContractsUnlocked: false,
    eliminated: false,
  };

  const state: GameState = {
    turn: 0,
    phase: "playing",
    corporations: {
      [playerCorpId]: playerCorp,
      [aiCorpId]: aiCorp,
    },
    cityNodes,
    harborNode,
    mapLinks,
    firms: {},
    contracts: {},
    tenders: {},
    loans: {},
    transactions: [],
    pendingEvents: [],
    eventHistory: [],
    barcodeAvailable: false,
    recessionTurnsRemaining: 0,
    recessionSeverity: 0,
    recessionCooldownRemaining: 0,
    activeHarborShocks: [],
    economicHistory: [],
    currentBaseInterestRate: GameConfig.loans.baseAnnualInterestRate,
    pendingNotifications: [],
    pendingTenderRenewals: [],
  };

  seedAI(state, aiCorpId);

  return state;
}

// ------------------------------------------------------------------
// AI seeding
// ------------------------------------------------------------------

function seedAI(state: GameState, aiCorpId: string): void {
  const aiCorp = state.corporations[aiCorpId];
  const cityId = GameConfig.ai.startingCityId;
  const city = state.cityNodes[cityId];
  if (!city || city.firmSlots === 0) return;

  const firmId = generateId();
  state.firms[firmId] = makeFirm(firmId, aiCorpId, cityId, "store", `${aiCorp.name} Store`);
  aiCorp.firmIds.push(firmId);
}

// ------------------------------------------------------------------
// Firm factory (shared by newGame and AI expansion)
// ------------------------------------------------------------------

export function makeFirm(
  id: string,
  corporationId: string,
  cityNodeId: string,
  type: "farm" | "factory" | "store",
  name: string,
  trainingIntensity = GameConfig.training.defaultCorporateIntensity,
): Firm {
  return {
    id, corporationId, cityNodeId, type, name,
    investments: [],
    productionLines: [],
    inventory: [],
    activeTenderIds: [],
    sellToCompetitors: false,
    retailPrices: {},
    salesRampProgress: {},
    harborAutoSource: {},
    trainingIntensity,
    trainingIntensityOverridden: false,
  };
}
