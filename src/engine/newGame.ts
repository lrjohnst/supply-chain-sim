import type { GameState, HarborNode, Corporation, Firm, MapConfig } from "../types";
import { GameConfig, defaultMapConfig } from "../config/gameConfig";
import { generateId } from "./utils";
import { getBasePrice, getHarborSoldProducts } from "./harbor";
import { buildCityNodes, buildMapLinks } from "./map";

/** Create a fresh game state. */
export function newGame(playerName: string, mapConfig: MapConfig = defaultMapConfig): GameState {
  const harborNode: HarborNode = {
    id: "harbor",
    name: "International Harbor",
    position: { x: 900, y: 400 },
    // Prices start at base values; tickHarborPrices overwrites them on turn 0.
    prices: Object.fromEntries(
      getHarborSoldProducts().map((p) => [p, getBasePrice(p)])
    ) as HarborNode["prices"],
  };

  const mapSeed = Math.floor(Math.random() * 2 ** 32);
  const cityNodes = buildCityNodes(mapSeed, mapConfig);
  const mapLinks = buildMapLinks(cityNodes, mapConfig);

  const playerCorpId = generateId();
  const aiCorpId = generateId();

  // Stable credit facility IDs (one per corporation, exists from turn 0 at zero balance)
  const playerCreditId = `credit-${playerCorpId}`;
  const aiCreditId     = `credit-${aiCorpId}`;

  const playerCorp: Corporation = {
    id: playerCorpId,
    name: playerName,
    isPlayer: true,
    cash: GameConfig.player.startingCash,
    firmIds: [],
    loanIds: [playerCreditId],
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
    loanIds: [aiCreditId],
    cumulativeRevenue: 0,
    corporateTrainingIntensity: GameConfig.training.defaultCorporateIntensity,
    marketingBudgetPerTurn: 0,
    multiYearContractsUnlocked: false,
    eliminated: false,
  };

  const baseRate = GameConfig.loans.baseAnnualInterestRate;

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
    loans: {
      [playerCreditId]: { id: playerCreditId, corporationId: playerCorpId, principal: 0, outstandingBalance: 0, annualInterestRate: baseRate },
      [aiCreditId]:     { id: aiCreditId,     corporationId: aiCorpId,     principal: 0, outstandingBalance: 0, annualInterestRate: baseRate },
    },
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
  // Pick the largest non-port city (highest population) as the AI starting city.
  const city = Object.values(state.cityNodes)
    .filter((n) => n.type !== "port")
    .sort((a, b) => b.population - a.population)[0];
  if (!city) return;

  // AI starts with a medium B-class store; find a free B-medium location
  const freeLoc = city.storeLocations.find(
    (l) => l.locationClass === "B" && l.size === "medium" && l.occupiedByFirmId === null
  );
  if (!freeLoc) return;

  const firmId = generateId();
  state.firms[firmId] = makeFirm(firmId, aiCorpId, city.id, "store", `${aiCorp.name} Store`, undefined, "B", "medium");
  aiCorp.firmIds.push(firmId);
  freeLoc.occupiedByFirmId = firmId;
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
  locationClass: "A" | "B" | "C" = "B",
  size: "small" | "medium" | "large" = "medium",
): Firm {
  return {
    id, corporationId, cityNodeId, type, name,
    locationClass, size,
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
    trainedFraction: 0,
    employeeCount: 1,
    utilizationPerSlot: {},
    capacityLimitedSlot: {},
  };
}
