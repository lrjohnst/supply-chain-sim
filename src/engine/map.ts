import type { GameState, CityNode, MapLink } from "../types";
import { GameConfig } from "../config/gameConfig";
import { generateId } from "./utils";

// Post-MVP: config-driven or procedurally generated map topology for variety between games.
// Post-MVP: link investment reduces transport cost and increases capacity.
// Post-MVP: AI starting city should be configurable or randomized.

// ------------------------------------------------------------------
// City nodes — one country, 16 nodes
// ------------------------------------------------------------------

export function buildCityNodes(): Record<string, CityNode> {
  const nodes: CityNode[] = [
    {
      id: "city_a", name: "Aldenmoor", type: "city",
      population: 800_000, firmSlots: GameConfig.firmSlots.large_city,
      energyCostMultiplier: 1.0, hasHarborAccess: false,
      position: { x: 300, y: 200 },
      wealthIndex: 0.6, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "city_b", name: "Brentwick", type: "city",
      population: 600_000, firmSlots: GameConfig.firmSlots.large_city,
      energyCostMultiplier: 1.1, hasHarborAccess: false,
      position: { x: 550, y: 150 },
      wealthIndex: 0.6, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "city_c", name: "Calderton", type: "city",
      population: 500_000, firmSlots: GameConfig.firmSlots.medium_city,
      energyCostMultiplier: 0.9, hasHarborAccess: true,
      position: { x: 750, y: 300 },
      wealthIndex: 0.6, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "city_d", name: "Dunhaven", type: "city",
      population: 400_000, firmSlots: GameConfig.firmSlots.medium_city,
      energyCostMultiplier: 1.05, hasHarborAccess: false,
      position: { x: 400, y: 400 },
      wealthIndex: 0.6, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "city_e", name: "Elmsford", type: "city",
      population: 350_000, firmSlots: GameConfig.firmSlots.medium_city,
      energyCostMultiplier: 0.95, hasHarborAccess: false,
      position: { x: 650, y: 450 },
      wealthIndex: 0.6, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_1", name: "Ashby", type: "town",
      population: 80_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.15, hasHarborAccess: false,
      position: { x: 200, y: 300 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_2", name: "Brixton Hollow", type: "town",
      population: 60_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.1, hasHarborAccess: false,
      position: { x: 450, y: 250 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_3", name: "Coppergate", type: "town",
      population: 70_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.2, hasHarborAccess: false,
      position: { x: 620, y: 200 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_4", name: "Drayton Cross", type: "town",
      population: 50_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.0, hasHarborAccess: false,
      position: { x: 300, y: 500 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_5", name: "Eatonbridge", type: "town",
      population: 55_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.05, hasHarborAccess: false,
      position: { x: 500, y: 500 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_6", name: "Fenwick", type: "town",
      population: 45_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 0.95, hasHarborAccess: true,
      position: { x: 820, y: 200 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_7", name: "Greystone", type: "town",
      population: 65_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.1, hasHarborAccess: false,
      position: { x: 150, y: 450 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_8", name: "Hartwell", type: "town",
      population: 40_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.0, hasHarborAccess: false,
      position: { x: 700, y: 550 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_9", name: "Irondale", type: "town",
      population: 75_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 0.9, hasHarborAccess: false,
      position: { x: 350, y: 600 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "town_10", name: "Jeyford", type: "town",
      population: 50_000, firmSlots: GameConfig.firmSlots.town,
      energyCostMultiplier: 1.05, hasHarborAccess: false,
      position: { x: 580, y: 600 },
      wealthIndex: 0.5, industrialIdentity: {}, demandModifier: 1.0,
    },
    {
      id: "harbor_city", name: "Port Verano", type: "harbor",
      population: 120_000, firmSlots: 0,
      energyCostMultiplier: 1.0, hasHarborAccess: true,
      position: { x: 900, y: 350 },
      wealthIndex: 0.7, industrialIdentity: {}, demandModifier: 1.0,
    },
  ];

  return Object.fromEntries(nodes.map((n) => [n.id, n]));
}

// ------------------------------------------------------------------
// Map links — 22 directed connections
// ------------------------------------------------------------------

export function buildMapLinks(nodes: Record<string, CityNode>): Record<string, MapLink> {
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
// Spatial queries
// ------------------------------------------------------------------

/** Returns IDs of nodes directly connected to nodeId (undirected). */
export function getConnectedNodes(state: GameState, nodeId: string): string[] {
  const connected = new Set<string>();
  for (const link of Object.values(state.mapLinks)) {
    if (link.fromNodeId === nodeId) connected.add(link.toNodeId);
    if (link.toNodeId === nodeId) connected.add(link.fromNodeId);
  }
  return [...connected];
}

/** Whether a node has direct harbor access. */
export function isHarborAccessible(state: GameState, nodeId: string): boolean {
  return state.cityNodes[nodeId]?.hasHarborAccess ?? false;
}

/**
 * Dijkstra shortest-path transport cost between two nodes.
 * Treats all links as undirected. Returns Infinity if no path exists.
 * Cost per link = baseCost (reduced by investmentLevel upgrades).
 */
export function getTransportCost(state: GameState, fromNodeId: string, toNodeId: string): number {
  if (fromNodeId === toNodeId) return 0;

  // Build adjacency: nodeId → [(neighborId, linkCost)]
  const adj = new Map<string, { neighbor: string; cost: number }[]>();
  for (const link of Object.values(state.mapLinks)) {
    const reduction = GameConfig.map.linkCostReductionPerLevel * link.investmentLevel;
    const cost = link.baseCost * (1 - reduction);
    if (!adj.has(link.fromNodeId)) adj.set(link.fromNodeId, []);
    if (!adj.has(link.toNodeId)) adj.set(link.toNodeId, []);
    adj.get(link.fromNodeId)!.push({ neighbor: link.toNodeId, cost });
    adj.get(link.toNodeId)!.push({ neighbor: link.fromNodeId, cost });
  }

  // Dijkstra with a simple sorted array (map is small: 16 nodes)
  const dist = new Map<string, number>();
  const queue: { nodeId: string; cost: number }[] = [{ nodeId: fromNodeId, cost: 0 }];
  dist.set(fromNodeId, 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { nodeId, cost } = queue.shift()!;
    if (cost > (dist.get(nodeId) ?? Infinity)) continue;
    if (nodeId === toNodeId) return cost;

    for (const { neighbor, cost: edgeCost } of adj.get(nodeId) ?? []) {
      const newCost = cost + edgeCost;
      if (newCost < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newCost);
        queue.push({ nodeId: neighbor, cost: newCost });
      }
    }
  }

  return dist.get(toNodeId) ?? Infinity;
}
