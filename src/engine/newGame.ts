import type { GameState, CityNode, HarborNode, MapLink, Corporation, Firm, Tender } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";

/** Create a fresh game state. */
export function newGame(playerName: string): GameState {
  const harborNode: HarborNode = {
    id: "harbor",
    name: "International Harbor",
    position: { x: 900, y: 400 },
    prices: { ...GameConfig.harborPrices } as Record<string, number> as HarborNode["prices"],
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
    activeContractIds: [],
    cumulativeRevenue: 0,
    trainingBudgetPerTurn: 0,
    marketingBudgetPerTurn: 0,
    multiYearContractsUnlocked: false,
  };

  const aiCorp: Corporation = {
    id: aiCorpId,
    name: GameConfig.ai.startingCorporationName,
    isPlayer: false,
    cash: GameConfig.ai.startingCash,
    firmIds: [],
    loanIds: [],
    activeContractIds: [],
    cumulativeRevenue: 0,
    trainingBudgetPerTurn: 500,
    marketingBudgetPerTurn: 0,
    multiYearContractsUnlocked: false,
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
    pendingWin: null,
  };

  seedStartingTenders(state);
  seedAI(state, aiCorpId);

  return state;
}

// ------------------------------------------------------------------
// Starting tenders (alumina + aluminium, available from turn 0)
// ------------------------------------------------------------------

function seedStartingTenders(state: GameState): void {
  for (const cfg of GameConfig.startingTenders) {
    const tender: Tender = {
      id: generateId(),
      direction: "market",
      publishedByCorporationId: null,
      product: cfg.product,
      volumeRequired: cfg.volumeRequired,
      targetUnitPrice: cfg.targetUnitPrice,
      minQuality: cfg.minQuality,
      durationTurns: cfg.durationTurns,
      openTurn: 0,
      closeTurn: cfg.closeTurn,
      status: "open",
      bids: [],
      awardedBids: [],
    };
    state.tenders[tender.id] = tender;
  }
}

// ------------------------------------------------------------------
// Map: one country, 16 nodes
// ------------------------------------------------------------------

function buildCityNodes(): Record<string, CityNode> {
  const nodes: CityNode[] = [
    {
      id: "city_a", name: "Aldenmoor", type: "city",
      population: 800_000, firmSlots: GameConfig.firmSlots.large_city,
      energyCostMultiplier: 1.0, hasHarborAccess: false,
      position: { x: 300, y: 200 },
    },
    {
      id: "city_b", name: "Brentwick", type: "city",
      population: 600_000, firmSlots: GameConfig.firmSlots.large_city,
      energyCostMultiplier: 1.1, hasHarborAccess: false,
      position: { x: 550, y: 150 },
    },
    {
      id: "city_c", name: "Calderton", type: "city",
      population: 500_000, firmSlots: GameConfig.firmSlots.medium_city,
      energyCostMultiplier: 0.9, hasHarborAccess: true,
      position: { x: 750, y: 300 },
    },
    {
      id: "city_d", name: "Dunhaven", type: "city",
      population: 400_000, firmSlots: GameConfig.firmSlots.medium_city,
      energyCostMultiplier: 1.05, hasHarborAccess: false,
      position: { x: 400, y: 400 },
    },
    {
      id: "city_e", name: "Elmsford", type: "city",
      population: 350_000, firmSlots: GameConfig.firmSlots.medium_city,
      energyCostMultiplier: 0.95, hasHarborAccess: false,
      position: { x: 650, y: 450 },
    },
    {
      id: "town_1", name: "Ashby", type: "town",
      population: 80_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.15, hasHarborAccess: false,
      position: { x: 200, y: 300 },
    },
    {
      id: "town_2", name: "Brixton Hollow", type: "town",
      population: 60_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.1, hasHarborAccess: false,
      position: { x: 450, y: 250 },
    },
    {
      id: "town_3", name: "Coppergate", type: "town",
      population: 70_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.2, hasHarborAccess: false,
      position: { x: 620, y: 200 },
    },
    {
      id: "town_4", name: "Drayton Cross", type: "town",
      population: 50_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.0, hasHarborAccess: false,
      position: { x: 300, y: 500 },
    },
    {
      id: "town_5", name: "Eatonbridge", type: "town",
      population: 55_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.05, hasHarborAccess: false,
      position: { x: 500, y: 500 },
    },
    {
      id: "town_6", name: "Fenwick", type: "town",
      population: 45_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 0.95, hasHarborAccess: true,
      position: { x: 820, y: 200 },
    },
    {
      id: "town_7", name: "Greystone", type: "town",
      population: 65_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.1, hasHarborAccess: false,
      position: { x: 150, y: 450 },
    },
    {
      id: "town_8", name: "Hartwell", type: "town",
      population: 40_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.0, hasHarborAccess: false,
      position: { x: 700, y: 550 },
    },
    {
      id: "town_9", name: "Irondale", type: "town",
      population: 75_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 0.9, hasHarborAccess: false,
      position: { x: 350, y: 600 },
    },
    {
      id: "town_10", name: "Jeyford", type: "town",
      population: 50_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.05, hasHarborAccess: false,
      position: { x: 580, y: 600 },
    },
    {
      id: "harbor_city", name: "Port Verano", type: "harbor",
      population: 120_000, firmSlots: 0,
      energyCostMultiplier: 1.0, hasHarborAccess: true,
      position: { x: 900, y: 350 },
    },
  ];

  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

function buildMapLinks(nodes: Record<string, CityNode>): Record<string, MapLink> {
  const connections: [string, string][] = [
    ["city_a", "city_b"], ["city_a", "city_d"], ["city_a", "town_1"], ["city_a", "town_7"],
    ["city_b", "city_c"], ["city_b", "town_2"], ["city_b", "town_3"],
    ["city_c", "city_e"], ["city_c", "town_6"], ["city_c", "harbor_city"],
    ["city_d", "city_e"], ["city_d", "town_2"], ["city_d", "town_4"], ["city_d", "town_5"],
    ["city_e", "town_5"], ["city_e", "town_8"], ["city_e", "town_10"],
    ["town_1", "town_7"], ["town_4", "town_9"], ["town_9", "town_10"],
    ["town_6", "harbor_city"], ["town_8", "harbor_city"],
  ];

  const links: Record<string, MapLink> = {};
  for (const [from, to] of connections) {
    if (!nodes[from] || !nodes[to]) continue;
    const id = generateId();
    links[id] = {
      id, fromNodeId: from, toNodeId: to,
      baseCost: GameConfig.map.transportCostPerLink,
      capacity: GameConfig.map.linkCapacityBase,
      investmentLevel: 0,
    };
  }
  return links;
}

// ------------------------------------------------------------------
// AI seeding
// ------------------------------------------------------------------

function seedAI(state: GameState, aiCorpId: string): void {
  const aiCorp = state.corporations[aiCorpId];
  const cityId = GameConfig.ai.startingCityNodeId;
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
  name: string
): Firm {
  return {
    id, corporationId, cityNodeId, type, name,
    quality: GameConfig.quality.baseQuality,
    investments: [],
    productionLines: [],
    inventory: [],
    activeContractIds: [],
    activeTenderIds: [],
    productionProgress: {
      chicken: 0, chicken_soup: 0,
      alumina_refining: 0, aluminium_smelting: 0, laptop_branding: 0,
    },
    sellToCompetitors: false,
    retailPrices: {},
    salesRampTurns: {},
  };
}
