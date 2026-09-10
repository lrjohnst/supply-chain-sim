import type { GameState, CityNode, MapLink } from "../types";
import { GameConfig } from "../config/gameConfig";
import { sampleNormal, clamp } from "./utils";

// Post-MVP: city events (factory closure, population boom, industrial decline).
// Post-MVP: player's own firms influence city wealth and industrial identity over time.
// Post-MVP: cluster bonuses for concentrated firm types in one city.
// Post-MVP: location list generation should include slight randomness so two cities with
// identical population and wealthIndex still have slightly different distributions of
// atomic store locations. Growth appends new StoreLocation entries to city.storeLocations.
// Post-MVP: port proximity wealth bonus — cities adjacent to harbor_city get a wealthIndex boost.
// Post-MVP: network wealth spillover — high-wealth neighbours raise baseWealthRate dynamically.
// Post-MVP: employment hooks — firm count and type affect population growth modifier.
// Post-MVP: land value system — geoCeiling proximity raises land costs, feeds into store rent.

/**
 * Effective demand multiplier for a city.
 * Formula: demandModifier × (0.5 + wealthIndex)
 * At defaults (wealthIndex=0.5, demandModifier=1.0) this returns 1.0 — no behavioral change.
 * Wealthier cities buy more; poorer cities buy less.
 */
export function getCityDemandMultiplier(state: GameState, cityId: string): number {
  const city = state.cityNodes[cityId];
  if (!city) return 1.0;
  return city.demandModifier * (0.5 + city.wealthIndex);
}

/**
 * Elasticity adjustment from city wealth.
 * Wealthier cities are less price-sensitive (adjustment < 1).
 * Poorer cities are more price-sensitive (adjustment > 1).
 * Formula: 1 - (wealthIndex - 0.5) × wealthElasticityFactor
 */
export function getWealthElasticityAdjustment(city: CityNode): number {
  return 1 - (city.wealthIndex - 0.5) * GameConfig.cities.wealthElasticityFactor;
}

/**
 * Update each city's population using a logistic growth model.
 * Called from tick.ts before retail sales so demand reads current population.
 *
 * Formula per city:
 *   networkFactor = clamp(networkBase + Σ(1 - d/networkMaxDistance) × networkScale, min, max)
 *   dP = baseGrowthRate × pop × (1 - pop/K) × networkFactor × timeScale
 *      - naturalDecayRate × pop × timeScale
 *      + N(0, populationNoiseStd × √timeScale) × pop
 *   pop = max(100, round(pop + dP))
 */
function getLinksForNode(state: GameState, nodeId: string): MapLink[] {
  return Object.values(state.mapLinks).filter(
    (l) => l.fromNodeId === nodeId || l.toNodeId === nodeId
  );
}

/**
 * Compute the network connectivity factor for a city node.
 *
 * Three components:
 *  1. Road topology — direct neighbours at full weight.
 *  2. Second-order topology — neighbours-of-neighbours at 15% weight.
 *  3. Population gravity — nearby cities (within networkPopRadiusPx canvas px)
 *     contribute based on their population and proximity, regardless of whether
 *     a road exists. This captures the real-world intuition that a village 10km
 *     from a major city is not "remote" even if it has only one road.
 *
 * Used by tickPopulation and by the CityScreen component for the connectedness icon.
 */
export function computeNetworkFactor(state: GameState, cityId: string): number {
  const cfg = GameConfig.cityLife;
  const city = state.cityNodes[cityId];
  if (!city) return cfg.networkBase;

  const directLinks = getLinksForNode(state, cityId);
  let score = 0;

  // --- Component 1 & 2: road topology ---
  for (const link of directLinks) {
    const neighbourId = link.fromNodeId === cityId ? link.toNodeId : link.fromNodeId;
    const dist = link.distance;
    if (dist < cfg.networkMaxDistance) {
      score += (1 - dist / cfg.networkMaxDistance) * cfg.networkScale;

      const secondLinks = getLinksForNode(state, neighbourId);
      for (const link2 of secondLinks) {
        if (link2.fromNodeId === cityId || link2.toNodeId === cityId) continue;
        const dist2 = link2.distance;
        if (dist2 < cfg.networkMaxDistance) {
          score += (1 - dist2 / cfg.networkMaxDistance) * cfg.networkScale * 0.15;
        }
      }
    }
  }

  // --- Component 3: population gravity ---
  // Nearby large cities lower remoteness even without a direct road connection.
  const r = cfg.networkPopRadiusPx;
  for (const [otherId, other] of Object.entries(state.cityNodes)) {
    if (otherId === cityId) continue;
    const dx = city.position.x - other.position.x;
    const dy = city.position.y - other.position.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    if (distPx < r) {
      const popUnit = other.population / cfg.networkPopNorm;
      score += popUnit * (1 - distPx / r) * cfg.networkPopScale;
    }
  }

  return clamp(cfg.networkBase + score, cfg.networkMin, cfg.networkMax);
}

export function tickPopulation(state: GameState): void {
  const cfg = GameConfig.cityLife;

  for (const city of Object.values(state.cityNodes)) {
    const pop = city.population;
    const K   = city.geoCeiling;

    const networkFactor = computeNetworkFactor(state, city.id);

    const noise = sampleNormal(0, cfg.populationNoiseStd * Math.sqrt(cfg.timeScale));
    let dP = city.baseGrowthRate * pop * (1 - pop / K) * networkFactor * cfg.timeScale;
    dP -= cfg.naturalDecayRate * pop * cfg.timeScale;
    dP += noise * pop;

    city.population = Math.max(100, Math.round(pop + dP));
  }
}

/**
 * Update each city's wealthIndex using the city's base wealth rate plus noise.
 * Called from tick.ts before retail sales so elasticity reads current wealthIndex.
 *
 * Formula per city:
 *   wd = baseWealthRate × timeScale + N(0, wealthNoiseStd × √timeScale)
 *   wealthIndex = clamp(wealthIndex + wd, wealthMin, wealthMax)
 */
export function tickWealth(state: GameState): void {
  const cfg    = GameConfig.cityLife;
  const cities = GameConfig.cities;

  for (const city of Object.values(state.cityNodes)) {
    const wd = city.baseWealthRate * cfg.timeScale
             + sampleNormal(0, cfg.wealthNoiseStd * Math.sqrt(cfg.timeScale));
    city.wealthIndex = clamp(city.wealthIndex + wd, cities.wealthMin, cities.wealthMax);
  }
}

/**
 * Industrial cluster bonus for a given firm type in a city.
 * Post-MVP: grows with firm concentration, rewards specialization.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getCityIndustrialBonus(_state: GameState, _cityId: string, _firmType: string): number {
  return 1.0;
}
