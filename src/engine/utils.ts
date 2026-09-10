import type { GameState } from "../types";
import { GameConfig } from "../config/gameConfig";

export function currentYear(state: GameState): number {
  return GameConfig.game.startYear + Math.floor(state.turn / GameConfig.game.quartersPerYear);
}

export function currentQuarter(state: GameState): number {
  return (state.turn % GameConfig.game.quartersPerYear) + 1;
}

export function turnLabel(state: GameState): string {
  return `${currentYear(state)} Q${currentQuarter(state)}`;
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Box-Muller transform: sample one value from N(mean, stdDev). */
export function sampleNormal(mean: number, stdDev: number): number {
  if (stdDev === 0) return mean;
  const u1 = Math.random() || 1e-10; // guard against log(0)
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdDev * z;
}

/** Returns the total asset book value for a corporation (investments at cost + inventory at cost). */
export function corporationAssetValue(state: GameState, corporationId: string): number {
  const corp = state.corporations[corporationId];
  let assets = corp.cash;

  for (const firmId of corp.firmIds) {
    const firm = state.firms[firmId];
    for (const inv of firm.investments) {
      if (inv.status === "complete" || inv.status === "in_progress") {
        assets += inv.costPaid;
      }
    }
    for (const line of firm.inventory) {
      assets += line.quantity * line.unitCost;
    }
  }

  return assets;
}

/** Returns total liabilities for a corporation. */
export function corporationLiabilities(state: GameState, corporationId: string): number {
  const corp = state.corporations[corporationId];
  let liabilities = 0;
  for (const loanId of corp.loanIds) {
    liabilities += state.loans[loanId].outstandingBalance;
  }
  return liabilities;
}

export function corporationNetWorth(state: GameState, corporationId: string): number {
  return corporationAssetValue(state, corporationId) - corporationLiabilities(state, corporationId);
}

/** Add or update an inventory line using weighted average cost. */
export function addToInventory(
  inventory: { product: string; quantity: number; unitCost: number }[],
  product: string,
  quantity: number,
  unitCost: number
): void {
  const existing = inventory.find((l) => l.product === product);
  if (existing) {
    const totalCost = existing.quantity * existing.unitCost + quantity * unitCost;
    existing.quantity += quantity;
    existing.unitCost = existing.quantity > 0 ? totalCost / existing.quantity : unitCost;
  } else {
    inventory.push({ product, quantity, unitCost });
  }
}

/** Remove quantity from inventory. Returns actual quantity removed (may be less if insufficient stock). */
export function removeFromInventory(
  inventory: { product: string; quantity: number; unitCost: number }[],
  product: string,
  quantity: number
): { removed: number; unitCost: number } {
  const line = inventory.find((l) => l.product === product);
  if (!line || line.quantity === 0) return { removed: 0, unitCost: 0 };
  const removed = Math.min(line.quantity, quantity);
  const unitCost = line.unitCost;
  line.quantity -= removed;
  return { removed, unitCost };
}

export function inventoryQuantity(
  inventory: { product: string; quantity: number }[],
  product: string
): number {
  return inventory.find((l) => l.product === product)?.quantity ?? 0;
}

/**
 * Compute the number of transport links between a city node and the nearest
 * harbor-access node, using BFS over the map link graph.
 * Returns 0 if the node itself has harbor access.
 */
export function linksToHarbor(state: GameState, cityNodeId: string): number {
  const start = state.cityNodes[cityNodeId];
  if (!start) return 0;
  if (start.type === "harbor" || start.type === "port") return 0;

  // Build adjacency map
  const adj: Record<string, string[]> = {};
  for (const link of Object.values(state.mapLinks)) {
    if (!adj[link.fromNodeId]) adj[link.fromNodeId] = [];
    if (!adj[link.toNodeId]) adj[link.toNodeId] = [];
    adj[link.fromNodeId].push(link.toNodeId);
    adj[link.toNodeId].push(link.fromNodeId);
  }

  // BFS
  const visited = new Set<string>();
  const queue: { id: string; dist: number }[] = [{ id: cityNodeId, dist: 0 }];
  visited.add(cityNodeId);

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    const node = state.cityNodes[id];
    if ((node?.type === "harbor" || node?.type === "port") && id !== cityNodeId) return dist;
    for (const neighbour of (adj[id] ?? [])) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push({ id: neighbour, dist: dist + 1 });
      }
    }
  }
  return 999; // unreachable
}

/** Transport cost per unit to move harbor goods to a given node. */
export function transportCostToNode(state: GameState, cityNodeId: string): number {
  const links = linksToHarbor(state, cityNodeId);
  return links * GameConfig.map.transportCostPerLink;
}
